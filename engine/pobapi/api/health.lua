-- health.*: build health check. What is wrong with the build, worst first, each with a fix and the tab (or "upgrades/<section>") that has it.
-- Every number comes from PoB's own outputs for the current Config tab; nothing here changes the build.
local util = require("pobapi.util")
local session = require("pobapi.session")
local budget = require("pobapi.api.budget")

local M = { }

local ORDER = { high = 1, medium = 2, low = 3 }

-- Gear slots that should hold something (the off-hand is checked separately: two-handed weapons fill it).
local GEAR = { "Weapon 1", "Helmet", "Body Armour", "Gloves", "Boots", "Amulet", "Ring 1", "Ring 2", "Belt" }

local function equipped(b, slotName)
	local slot = b.itemsTab.slots[slotName]
	return slot and slot.selItemId and slot.selItemId ~= 0 and b.itemsTab.items[slot.selItemId] or nil
end

-- Passive points a character of `level` has with the campaign's quest rewards done (PoB's own estimate).
local function pointsAvailable(b, level, extra)
	local quest = 0
	for _, act in ipairs(b.acts or { }) do
		if (act.level or 1) <= level then
			quest = math.max(quest, act.questPoints or 0)
		end
	end
	return math.max(level - 1, 0) + quest + (extra or 0)
end

function M.check()
	local b = session.build()
	local out = b.calcsTab.mainOutput or { }
	local findings = util.array()
	local function add(severity, area, message, fix, tab)
		findings[#findings + 1] = { severity = severity, area = area, message = message, fix = fix, tab = tab }
	end
	local level = b.characterLevel or 1

	-- Resistances (PoE2 caps elemental resistances at 75% by default).
	for _, elem in ipairs({ "Fire", "Cold", "Lightning" }) do
		local res, cap = out[elem .. "Resist"] or 0, out[elem .. "ResistMax"] or 75
		if res < cap then
			add(res < cap - 25 and "high" or "medium", "resistances",
				("%s resistance is %d%% (cap %d%%)"):format(elem, res, cap),
				("Find %d%% %s resistance on gear (rings, belt and boots are the cheapest slots)"):format(cap - res, elem:lower()),
				"upgrades/gear")
		end
	end
	local chaos = out.ChaosResist or 0
	if chaos < 0 then
		add("medium", "resistances", ("Chaos resistance is %d%%"):format(chaos),
			"Get chaos resistance to at least 0% (rings, amulet, and Soul Core of Tacati in a socket)", "upgrades/gear")
	end

	-- Passive and ascendancy points.
	local used, ascUsed, _, _, ws1, ws2 = b.spec:CountAllocNodes()
	local normal = used - math.min(ws1 or 0, ws2 or 0)
	local available = pointsAvailable(b, level, out.ExtraPoints)
	if normal < available then
		local unspent = available - normal
		add(unspent >= 5 and "high" or unspent >= 2 and "medium" or "low", "passive points",
			("%d unspent passive point%s (%d of %d spent at level %d, with the campaign's quest points)"):format(
				unspent, unspent == 1 and "" or "s", normal, available, level),
			"Spend them: the Tree tab's advisor shows where the next point should go", "tree")
	elseif normal > available + 1 then
		add("low", "passive points", ("%d passive points spent but level %d gives about %d"):format(normal, level, available),
			"Check the character level (header) or refund extra points", "tree")
	end
	local ascClass = b.spec.curAscendClassName
	if not ascClass or ascClass == "None" then
		if level >= 30 then
			add("medium", "ascendancy", "No ascendancy chosen", "Pick an ascendancy (New build, or Import your character)", nil)
		end
	elseif ascUsed < 8 and level >= 60 then
		add("low", "ascendancy", ("%d of 8 ascendancy points allocated"):format(ascUsed),
			"Allocate the rest when you have done the trials", "tree")
	end

	-- Main skill and its supports.
	local group = b.skillsTab.socketGroupList[b.mainSocketGroup]
	if not group then
		add("high", "skills", "No main skill", "Add a skill group on the Skills tab", "skills")
	else
		local supports, active = 0, nil
		for _, gem in ipairs(group.gemList or { }) do
			local ge = gem.gemData and gem.gemData.grantedEffect
			if gem.enabled ~= false and gem.gemData then
				if ge and ge.support then
					supports = supports + 1
				elseif not active then
					active = gem.gemData.name or gem.nameSpec
				end
			end
			if gem.errMsg and gem.errMsg ~= "" then
				add("high", "gems", ("%s: %s"):format(gem.nameSpec or "?", gem.errMsg), "Fix it on the Skills tab", "skills")
			end
		end
		local wanted = level >= 60 and 4 or level >= 30 and 3 or 2
		if supports < wanted then
			add(supports + 1 < wanted and "high" or "medium", "supports",
				("Main skill %s has %d support%s"):format(active or "?", supports, supports == 1 and "" or "s"),
				"Add supports: Upgrades → Gems ranks the best ones for this skill", "upgrades/gems")
		end
		if (out.TotalDPS or 0) <= 0 and (out.CombinedDPS or 0) <= 0 and (out.FullDPS or 0) <= 0 then
			add("medium", "skills", ("Main skill %s shows no damage"):format(active or "?"),
				"Pick a damage skill as the main skill, or check the Config tab (enemy conditions)", "skills")
		end
	end

	-- Attribute requirements.
	for short, long in pairs({ Str = "Strength", Dex = "Dexterity", Int = "Intelligence" }) do
		local have, need = out[short] or 0, out["Req" .. short] or 0
		if have < need then
			add("high", "requirements", ("%s %d, but gear and gems need %d"):format(long, have, need),
				"Raise it with attribute nodes (Tree advisor) or gear; unmet requirements switch items and gems off", "tree")
		end
	end

	-- Spirit and reservations.
	local summary = budget.get()
	if (summary.spiritShort or 0) > 0 or (summary.free or 0) < 0 then
		local short = math.max(summary.spiritShort or 0, -(summary.free or 0))
		add("high", "spirit", ("Spirit short by %d: some reserving skills switch off"):format(short),
			"Drop a reservation or add Spirit (body armour, sceptre)", "skills")
	elseif summary.totems and summary.spiritLimited then
		add("medium", "spirit", ("%d of %d totems: Spirit limits them"):format(summary.totems, summary.totemCap or 0),
			("%d more Spirit for the next totem"):format(math.max(0, (summary.totemCost or 0) - math.max(0, summary.free or 0))), "upgrades/gear")
	elseif (summary.spirit or 0) >= 30 and (summary.free or 0) >= 30 then
		add("low", "spirit", ("%d Spirit unused"):format(summary.free),
			"Spend it on a persistent buff or aura (30+ Spirit fits most)", "skills")
	end
	for _, r in ipairs(summary.resources or { }) do
		if r.costPerSecond and r.regen and r.costPerSecond > r.regen * 1.05 and r.key == "Mana" then
			add("medium", "sustain", ("The main skill spends %.0f mana/s but you regenerate %.0f/s"):format(r.costPerSecond, r.regen),
				"Add mana regeneration, leech or cost reduction (Efficiency, Inspiration) or a mana flask", "upgrades/gems")
		end
	end

	-- Survivability.
	local pool = (out.Life or 0) + (out.EnergyShield or 0)
	if level >= 20 and pool < level * 20 then
		add("high", "survivability", ("Life %d and energy shield %d at level %d"):format(out.Life or 0, out.EnergyShield or 0, level),
			"Add maximum life or energy shield on every armour slot", "upgrades/gear")
	end
	if level >= 20 and (out.MovementSpeedMod or 1) <= 1.0 then
		add("medium", "movement", "No increased movement speed",
			"Get movement speed on boots (it is the most valuable boot mod)", "upgrades/gear")
	end

	-- Gear, charms and flasks.
	for _, slotName in ipairs(GEAR) do
		if not equipped(b, slotName) then
			add(slotName:match("Ring") and "medium" or "high", "gear", ("Nothing in %s"):format(slotName),
				"Equip something: Upgrades → Shop ranks the uniques that fit", "upgrades/shop")
		end
	end
	local main = equipped(b, "Weapon 1")
	if main and main.base and main.base.tags and not main.base.tags.twohand and not equipped(b, "Weapon 2")
		and not (main.base.type == "Bow" or main.base.type == "Crossbow") then
		add("medium", "gear", ("Off-hand is empty next to a one-handed %s"):format(main.base.type or "weapon"),
			"A shield, focus or quiver adds defence or damage for free (Upgrades → Shop)", "upgrades/shop")
	end
	local flasks = 0
	for i = 1, 2 do
		if equipped(b, "Flask " .. i) then flasks = flasks + 1 end
	end
	if flasks < 2 and level >= 10 then
		add("medium", "flasks", ("%d of 2 flask slots empty"):format(2 - flasks), "Equip a life and a mana flask", "items")
	end
	local charmLimit, charms = out.CharmLimit or 0, 0
	for i = 1, 3 do
		if equipped(b, "Charm " .. i) then charms = charms + 1 end
	end
	if charms < charmLimit then
		add("low", "charms", ("%d of %d charm slots empty"):format(charmLimit - charms, charmLimit),
			"Charms are cheap defence (freeze, stun, ignite...)", "items")
	end
	-- Allocated jewel sockets with no jewel.
	local emptySockets = 0
	for _, slot in ipairs(b.itemsTab.orderedSlots) do
		if slot.nodeId and b.spec.allocNodes[slot.nodeId] and (not slot.selItemId or slot.selItemId == 0) then
			emptySockets = emptySockets + 1
		end
	end
	if emptySockets > 0 then
		add("medium", "jewels", ("%d allocated jewel socket%s without a jewel"):format(emptySockets, emptySockets == 1 and "" or "s"),
			"Socket a jewel (Upgrades → Jewels) or refund the socket's point", "upgrades/jewels")
	end

	table.sort(findings, function(x, y)
		if ORDER[x.severity] ~= ORDER[y.severity] then
			return ORDER[x.severity] < ORDER[y.severity]
		end
		return x.area < y.area
	end)
	local counts = { high = 0, medium = 0, low = 0 }
	for _, f in ipairs(findings) do
		counts[f.severity] = counts[f.severity] + 1
	end
	return { findings = findings, counts = counts, level = level }
end

return M
