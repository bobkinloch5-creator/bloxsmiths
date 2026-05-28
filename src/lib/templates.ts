export const GAME_TYPES = [
  "Simulator",
  "Tycoon",
  "Obby",
  "Fighting",
  "Roleplay",
  "Mining",
  "Pet",
  "Tower Defense",
  "Round-based",
  "Horror",
  "Racing",
  "Adventure",
  "Custom",
] as const;

export const STARTER_TEMPLATES = [
  "Blank",
  "Simulator",
  "Tycoon",
  "Obby",
  "Pet Simulator",
  "Mining Simulator",
  "Shop/Inventory",
  "Admin Commands",
] as const;

export function templateFiles(
  template: string,
): Array<{ path: string; file_type: string; service_location: string; content: string }> {
  // Default: start with an empty project. The AI organizes scripts into
  // ServerScriptService / StarterPlayer / ReplicatedStorage on its own.
  if (template === "Simulator" || template === "Pet Simulator" || template === "Mining Simulator") {
    return [
      {
        path: "ServerScriptService/Services/DataService",
        file_type: "ModuleScript",
        service_location: "ServerScriptService",
        content: `-- DataService.lua
local DataStoreService = game:GetService("DataStoreService")
local store = DataStoreService:GetDataStore("BloxSmithData_v1")

local DataService = {}
local cache = {}

function DataService:Get(player)
\tif cache[player.UserId] then return cache[player.UserId] end
\tlocal ok, data = pcall(function() return store:GetAsync(tostring(player.UserId)) end)
\tcache[player.UserId] = (ok and data) or { Coins = 0, Rebirths = 0, Inventory = {} }
\treturn cache[player.UserId]
end

function DataService:Save(player)
\tlocal data = cache[player.UserId]
\tif not data then return end
\tpcall(function() store:SetAsync(tostring(player.UserId), data) end)
end

return DataService
`,
      },
    ];
  }
  return [];
}
