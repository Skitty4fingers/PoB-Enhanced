-- Access to the live build object and recalculation helpers.
local util = require("pobapi.util")

local M = {}

function M.build()
	return __mainObject__.main.modes["BUILD"]
end

-- Run one frame so PoB processes pending flags (buildFlag, mode changes, recalculation).
function M.frame()
	runCallback("OnFrame")
	build = M.build()
	return build
end

-- Mark the build dirty and recalculate.
function M.recalc()
	local b = M.build()
	b.buildFlag = true
	return M.frame()
end

-- PoB reports errors from launch:OnFrame's PCall as a prompt instead of raising them. Returns its text and clears it.
local function takePrompt()
	local msg = launch.promptMsg
	launch.promptMsg = nil
	if not msg then
		return nil
	end
	msg = util.strip(msg):gsub("^Error:%s*", ""):gsub("\nPress Enter.*$", ""):gsub("\nv[%d%.]+[^\n]*$", "")
	return (msg:gsub("^In 'OnFrame': ", ""))
end

-- Load a build (or a new one when xml is nil). Raises if PoB fails part-way, which would otherwise leave a
-- half-loaded build (default Ranger tree, old skills) that still answers every call.
function M.setMode(name, xml)
	if GlobalCache and GlobalCache.cachedData then
		wipeGlobalCache()
	end
	takePrompt()
	wipeTable(__mainObject__.main.popups) -- nobody can dismiss them headless
	-- buildMode:Init builds the ImportTab before the new tree/skills/items tabs, and the ImportTab reads the old ones.
	-- After a failed load the old tree tab has no specs, which made every later load fail the same way.
	local b = M.build()
	b.treeTab, b.skillsTab, b.itemsTab = nil, nil, nil
	__mainObject__.main:SetMode("BUILD", false, name or "", xml)
	M.frame()
	local err = takePrompt()
	if err then
		util.fail("PoB could not load the build: " .. err, "load_failed")
	end
	return build
end

function M.player()
	return M.build().calcsTab.mainEnv.player
end

function M.output()
	return M.build().calcsTab.mainOutput
end

return M
