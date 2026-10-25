-- Boots Path of Building headless. Mirrors src/HeadlessWrapper.lua without blocking on stdin.
local M = {}

-- Upstream fixes (patches/, applied by pob2.patches into ../.patched/): load the patched copy of a file instead of
-- src/'s, but only while src/'s file is still the one the patch was applied to. After an upstream update the copy
-- is stale and src/'s file wins.
M.patched = { }
function M.usePatchedFiles()
	local f = io.open("../.patched/manifest.json", "rb")
	if not f then
		return
	end
	local ok, manifest = pcall(function() return require("dkjson").decode(f:read("*a")) end)
	f:close()
	if not ok or type(manifest) ~= "table" or type(manifest.files) ~= "table" then
		return
	end
	local sha1 = require("sha1")
	local overlay = { }
	for rel, info in pairs(manifest.files) do
		local src = io.open(rel, "rb")
		local original = src and src:read("*a")
		if src then src:close() end
		if original and sha1.sha1(original) == info.original then
			overlay[rel] = "../" .. info.path
			M.patched[#M.patched + 1] = rel
		else
			io.stderr:write("pobapi: ignoring stale patched copy of " .. rel .. " (src/ changed)\n")
		end
	end
	local l_loadfile = loadfile
	function loadfile(name, ...)
		local path = name and overlay[name:gsub("\\", "/"):gsub("^%./", "")]
		return l_loadfile(path or name, ...)
	end
end

function M.start()
	dofile("_SimpleGraphic.def.lua")

	function GetVirtualScreenSize()
		return 1920, 1080
	end

	__callbackTable__ = { }
	function runCallback(name, ...)
		if __callbackTable__[name] then
			return __callbackTable__[name](...)
		elseif __mainObject__ and __mainObject__[name] then
			return __mainObject__[name](__mainObject__, ...)
		end
	end

	local l_require = require
	function require(name)
		-- lcurl is only needed for network features, which the worker does not use
		if name == "lcurl.safe" then
			return
		end
		return l_require(name)
	end

	M.usePatchedFiles()
	dofile("Launch.lua")
	__mainObject__.continuousIntegrationMode = os.getenv("CI")
	runCallback("OnInit")
	-- Running from a checkout puts PoB in dev mode, which saves ~~temp~~.xml whenever a build closes. The worker never
	-- writes build files, and that save throws for a build whose load failed, which then blocks every later load.
	if __mainObject__.main then
		__mainObject__.main.disableDevAutoSave = true
	end
	runCallback("OnFrame")
	-- Launch.lua sets a GC pause of 400 (the heap may grow to 4x its live size between cycles), which suits the desktop
	-- app but lets heavy advice calls reach ~3 GB here; 150 keeps them under ~2 GB at the same speed.
	collectgarbage("setpause", tonumber(os.getenv("POB2_GC_PAUSE")) or 150)

	if __mainObject__.promptMsg then
		error("PoB failed to start: " .. tostring(__mainObject__.promptMsg))
	end

	build = __mainObject__.main.modes["BUILD"]
end

return M
