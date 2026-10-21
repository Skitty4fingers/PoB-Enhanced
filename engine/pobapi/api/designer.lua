-- designer.*: design the best rare for a slot from the real mod pool. Keeps the slot's base, quality, sockets, runes and
-- implicits, then picks up to 3 prefixes and 3 suffixes greedily, each measured in the build with PoB's calculator
-- (top tier that can roll at the item level, one mod per family, rolled at the top of its range).
local util = require("pobapi.util")
local session = require("pobapi.session")
local gear = require("pobapi.api.gear")

local M = { }

local MAX = { Prefix = 3, Suffix = 3 }

-- "+(5-8) to Strength" -> "+8 to Strength" (top of each range).
local function topRoll(line)
	return (line:gsub("%((%-?[%d%.]+)%-(%-?[%d%.]+)%)", "%2"))
end

local function lowRoll(line)
	return tonumber(line:match("%((%-?[%d%.]+)%-%-?[%d%.]+%)") or line:match("(%-?[%d%.]+)"))
end

-- The current item's raw text split into everything up to the implicits, and the implicit block itself.
local function rawParts(item)
	local lines = { }
	for line in (item:BuildRaw() .. "\n"):gmatch("([^\n]*)\n") do
		lines[#lines + 1] = line
	end
	local head, implicits, i = { }, { }, 1
	local nameLines = 1
	while i <= #lines do
		local line = lines[i]
		local n = line:match("^Implicits: (%d+)$")
		if n then
			n = tonumber(n)
			for j = 1, n do
				implicits[#implicits + 1] = lines[i + j]
			end
			break
		end
		local rarity = line:match("^Rarity: (%u+)")
		if rarity then
			nameLines = (rarity == "RARE" or rarity == "UNIQUE" or rarity == "RELIC") and 2 or 1
		elseif not line:match("^Unique ID:") and line ~= "Corrupted" and line ~= "Mirrored" then
			head[#head + 1] = line
		end
		i = i + 1
	end
	-- Drop the old name/base lines; the rest are the item's properties (quality, sockets, runes, requirements...).
	local props = { }
	for k = nameLines + 1, #head do
		props[#props + 1] = head[k]
	end
	return props, implicits
end

local function makeItem(base, head, implicits, mods, title, itemLevel)
	local lines = { "Rarity: RARE", title, base.name }
	-- Keep what the item really carries; armour/evasion/ES/Spirit lines are display values PoB derives itself.
	for _, prop in ipairs(head) do
		if prop:match("^Quality:") or prop:match("^Sockets:") or prop:match("^Rune:") then
			lines[#lines + 1] = prop
		end
	end
	lines[#lines + 1] = "Item Level: " .. itemLevel
	lines[#lines + 1] = "Implicits: " .. #implicits
	for _, l in ipairs(implicits) do lines[#lines + 1] = l end
	for _, m in ipairs(mods) do
		for _, l in ipairs(m.lines) do lines[#lines + 1] = l end
	end
	local item = new("Item"):Item(table.concat(lines, "\n"))
	item:NormaliseQuality()
	item:BuildModList()
	return item
end

-- Top eligible tier of every mod family that can roll on the base.
local function candidates(probe, itemLevel)
	local best = { }
	for id, mod in pairs(data.itemMods.Item) do
		if (mod.type == "Prefix" or mod.type == "Suffix") and (mod.level or 0) <= itemLevel and mod[1]
			and probe:GetModSpawnWeight(mod) > 0 then
			local family = mod.group or id
			local key = mod.type .. "|" .. family
			if not best[key] or (mod.level or 0) > (best[key].mod.level or 0) then
				best[key] = { id = id, mod = mod, family = family }
			end
		end
	end
	local res = { }
	for _, c in pairs(best) do
		local lines = { }
		for _, l in ipairs(c.mod) do lines[#lines + 1] = topRoll(l) end
		res[#res + 1] = { id = c.id, type = c.mod.type, family = c.family, affix = c.mod.affix, tier = c.mod.level,
			lines = lines, raw = c.mod }
	end
	return res
end

local function tradeFilter(mod)
	for hash, texts in pairs(mod.raw.tradeHashes or { }) do
		local min = lowRoll((texts and texts[1]) or mod.raw[1] or "")
		return { id = "explicit.stat_" .. tostring(hash), value = min and { min = min } or nil }
	end
end

function M.rare(params)
	local b = session.build()
	local slotName = util.require(params, "slot", "string")
	local slot = b.itemsTab.slots[slotName]
	if not slot then
		util.fail("Unknown slot: " .. slotName)
	end
	local current = b.itemsTab.items[slot.selItemId]
	if not current or not current.base then
		util.fail("Equip something in " .. slotName .. " first: the designer keeps its base, sockets and implicits")
	end
	if current.type == "Jewel" or current.type == "Flask" or current.type == "Charm" then
		util.fail("The designer covers gear slots (weapons, armour, jewellery), not " .. current.type:lower() .. "s")
	end
	local itemLevel = math.min(math.max(tonumber(params.itemLevel) or 82, 1), 100)
	local metric = gear._metricOf(params)
	local calcFunc, _, measure = gear._measurer(b, metric)
	local base = { name = current.baseName or current.base.name or current.name }
	local head, implicits = rawParts(current)
	local title = "Designed " .. slotName
	local probe = makeItem(base, head, implicits, { }, title, itemLevel)
	local pool = candidates(probe, itemLevel)
	local baseline = measure(calcFunc({ repSlotName = slotName, repItem = probe }))

	local chosen, counts, used = { }, { Prefix = 0, Suffix = 0 }, { }
	local shortlist
	local steps = util.array()
	for _ = 1, MAX.Prefix + MAX.Suffix do
		local bestRow
		local scored = { }
		for _, c in ipairs(shortlist or pool) do
			if not used[c.type .. "|" .. c.family] and counts[c.type] < MAX[c.type] then
				local mods = { unpack(chosen) }
				mods[#mods + 1] = c
				local ok, r = pcall(function()
					return measure(calcFunc({ repSlotName = slotName, repItem = makeItem(base, head, implicits, mods, title, itemLevel) }))
				end)
				if ok then
					scored[#scored + 1] = { c = c, r = r }
					if not bestRow or r.score > bestRow.r.score then
						bestRow = { c = c, r = r }
					end
				end
			end
		end
		if not shortlist then
			-- Later rounds only re-test the 30 best of the first, measured in full.
			table.sort(scored, function(x, y) return x.r.score > y.r.score end)
			shortlist = { }
			for k = 1, math.min(30, #scored) do shortlist[k] = scored[k].c end
		end
		local prev = steps[#steps] and steps[#steps].after or baseline
		if not bestRow or bestRow.r.score <= prev.score + 0.05 then
			-- Nothing measurable left: fill the open affixes with life or resistances (still useful), else stop.
			break
		end
		chosen[#chosen + 1] = bestRow.c
		counts[bestRow.c.type] = counts[bestRow.c.type] + 1
		used[bestRow.c.type .. "|" .. bestRow.c.family] = true
		steps[#steps + 1] = { mod = bestRow.c, after = bestRow.r, gain = bestRow.r.score - prev.score }
	end

	local designed = makeItem(base, head, implicits, chosen, title, itemLevel)
	local final = measure(calcFunc({ repSlotName = slotName, repItem = designed }))
	local mods = util.array()
	local filters = { }
	for _, s in ipairs(steps) do
		mods[#mods + 1] = { type = s.mod.type, affix = s.mod.affix, family = s.mod.family, tier = s.mod.tier,
			lines = s.mod.lines, gain = s.gain }
		filters[#filters + 1] = tradeFilter(s.mod)
	end
	local query
	if #filters > 0 then
		query = {
			query = {
				status = { option = "online" },
				type = base.name,
				filters = { type_filters = { filters = { rarity = { option = "nonunique" } } } },
				stats = { { type = "count", value = { min = math.max(1, #filters - 1) }, filters = filters } },
			},
			sort = { price = "asc" },
		}
	end
	return {
		slot = slotName,
		base = base.name,
		itemLevel = itemLevel,
		metric = metric,
		replaces = current.name,
		text = designed:BuildRaw(),
		mods = mods,
		gain = final,
		openAffixes = { prefixes = MAX.Prefix - counts.Prefix, suffixes = MAX.Suffix - counts.Suffix },
		tradeQuery = query,
		note = "Top-tier rolls at item level " .. itemLevel .. "; real items roll lower. The trade search asks for all but one of these mods.",
	}
end

return M
