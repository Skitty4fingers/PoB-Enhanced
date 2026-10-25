-- Maps RPC method names ("namespace.method") to handler functions.
local registry = { }

local namespaces = { "build", "stats", "skills", "items", "tree", "config", "data", "reference", "advisor", "gear", "gems", "budget", "sockets", "health", "compare", "designer" }
for _, ns in ipairs(namespaces) do
	local mod = require("pobapi.api." .. ns)
	for name, fn in pairs(mod) do
		if type(fn) == "function" and name:sub(1, 1) ~= "_" and name ~= "describe" and name ~= "diff" and name ~= "suggest" then
			registry[ns .. "." .. name] = fn
		end
	end
end

registry["worker.ping"] = function()
	return { pong = true, version = launch.versionNumber, time = os.time(), patched = require("pobapi.boot").patched }
end

-- Lua heap and process memory (kB); collect=true runs a full garbage collection first.
registry["worker.memory"] = function(params)
	if params.collect then
		collectgarbage("collect")
	end
	local mem = { luaKB = math.floor(collectgarbage("count")) }
	local f = io.open("/proc/self/status", "r")
	if f then
		local status = f:read("*a")
		f:close()
		mem.rssKB = tonumber(status:match("VmRSS:%s*(%d+)"))
		mem.peakKB = tonumber(status:match("VmHWM:%s*(%d+)"))
	end
	return mem
end

return registry
