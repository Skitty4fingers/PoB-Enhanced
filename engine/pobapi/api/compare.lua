-- compare.*: compare the live build with a second build (any PoB code or link). PoB holds one build at a time, so a
-- single call loads the other build, reads it, and loads yours back; no other request ever sees the swap.
local util = require("pobapi.util")
local session = require("pobapi.session")
local budget = require("pobapi.api.budget")
local build = require("pobapi.api.build")
local items = require("pobapi.api.items")
local skills = require("pobapi.api.skills")
local tree = require("pobapi.api.tree")
local config = require("pobapi.api.config")

local M = { }

-- Stats shown side by side (label, output key, higher is better).
local STATS = {
	{ "Life", "Life" }, { "Energy Shield", "EnergyShield" }, { "Mana", "Mana" }, { "Spirit", "Spirit" },
	{ "Armour", "Armour" }, { "Evasion", "Evasion" }, { "Block chance", "EffectiveBlockChance" },
	{ "Fire resistance", "FireResist" }, { "Cold resistance", "ColdResist" },
	{ "Lightning resistance", "LightningResist" }, { "Chaos resistance", "ChaosResist" },
	{ "Max physical hit", "PhysicalMaximumHitTaken" }, { "Movement speed", "MovementSpeedMod", true },
	{ "Strength", "Str" }, { "Dexterity", "Dex" }, { "Intelligence", "Int" },
	{ "Crit chance", "CritChance" }, { "Skill speed", "Speed" }, { "Average hit", "AverageHit" },
}

local function snapshot()
	local b = session.build()
	local out = b.calcsTab.mainOutput or { }
	local sum = budget.get()
	local stats = { }
	for _, s in ipairs(STATS) do
		local v = out[s[2]]
		if type(v) == "number" then
			stats[s[2]] = s[3] and (v - 1) * 100 or v
		end
	end
	stats.DPS = sum.effectiveDps
	stats.EHP = sum.ehp
	local slots = util.array()
	for _, row in ipairs(items.list({ full = false, includeEmpty = true })) do
		if row.item or not row.jewelNodeId then
			local item = row.item and b.itemsTab.items[b.itemsTab.slots[row.slot].selItemId]
			slots[#slots + 1] = {
				slot = row.slot,
				name = row.item and row.item.name or nil,
				rarity = row.item and row.item.rarity or nil,
				text = item and item:BuildRaw() or nil,
			}
		end
	end
	local nodes = { }
	for id, node in pairs(b.spec.allocNodes) do
		nodes[#nodes + 1] = { id = id, name = node.dn, type = node.type }
	end
	local configValues = { }
	for _, c in ipairs(config.list({ all = true })) do
		if c.value ~= nil and c.value ~= c.default then
			configValues[c.var] = { label = c.label, value = c.value }
		end
	end
	local groups = util.array()
	for _, g in ipairs(skills.list()) do
		local gems = util.array()
		for _, gem in ipairs(g.gems or { }) do
			gems[#gems + 1] = { name = gem.name, level = gem.level, quality = gem.quality, support = gem.support, enabled = gem.enabled }
		end
		groups[#groups + 1] = { index = g.index, label = g.displayLabel, enabled = g.enabled, isMain = g.isMain, gems = gems }
	end
	return {
		info = build.info(),
		skill = sum.skill,
		totems = sum.totems,
		stats = stats,
		items = slots,
		skills = groups,
		nodes = nodes,
		treeUrl = tree.export_url().url,
		config = configValues,
	}
end

-- Both builds' data: { mine, theirs }. Your build is restored exactly (saved and reloaded through PoB's own XML).
function M.collect(params)
	local xml = util.require(params, "xml", "string")
	if not xml:find("<PathOfBuilding", 1, true) then
		util.fail("Not a Path of Building build XML")
	end
	local b = session.build()
	local mineXml = b:SaveDB("code")
	local mineName = b.buildName
	local mine = snapshot()
	local ok, theirs = pcall(function()
		session.setMode(params.name or "Compared build", xml)
		session.frame()
		return snapshot()
	end)
	session.setMode(mineName, mineXml)
	session.frame()
	if not ok then
		util.fail("Could not load the build to compare: " .. tostring(theirs))
	end
	local labels, order = { DPS = "DPS", EHP = "EHP" }, { "DPS", "EHP" }
	for _, s in ipairs(STATS) do
		labels[s[2]] = s[1]
		order[#order + 1] = s[2]
	end
	return { mine = mine, theirs = theirs, statLabels = labels, statOrder = order }
end

return M
