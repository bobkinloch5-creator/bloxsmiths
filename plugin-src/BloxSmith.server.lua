-- BloxSmith Roblox Studio Plugin
-- Full game-building agent: syncs scripts AND executes build actions
-- (parts, models, terrain, lighting, services) sent from bloxsmith.pro.
-- Also reports full workspace context back to the AI so it has awareness.
--
-- Save as a Local Plugin: File > Advanced > Save as Local Plugin

local HttpService           = game:GetService("HttpService")
local ChangeHistoryService  = game:GetService("ChangeHistoryService")
local Selection             = game:GetService("Selection")
local Lighting              = game:GetService("Lighting")
local Workspace             = game:GetService("Workspace")
local ServerScriptService   = game:GetService("ServerScriptService")
local ServerStorage         = game:GetService("ServerStorage")
local ReplicatedStorage     = game:GetService("ReplicatedStorage")
local ReplicatedFirst       = game:GetService("ReplicatedFirst")
local StarterPlayer         = game:GetService("StarterPlayer")
local StarterGui            = game:GetService("StarterGui")
local StarterPack           = game:GetService("StarterPack")
local SoundService          = game:GetService("SoundService")
local Teams                 = game:GetService("Teams")
local RunService            = game:GetService("RunService")
local Terrain               = Workspace.Terrain

-- API base is user-configurable so the plugin works against bloxsmith.pro
-- (production) AND any Lovable preview / staging URL the user is testing.
local DEFAULT_API   = "https://bloxsmith.pro/api/public/plugin"
local POLL_SECONDS  = 0.2
local CTX_SECONDS   = 15  -- how often we re-send workspace context to the AI
local SCAN_TIMEOUT_SECONDS = 15
local pushSnapshot
local showScriptPromptDialog
local instancePath
local scanInProgress = false
local scanCancelRequested = false
local connected = false
local shouldBeConnected = false
local activeProjectId = nil
local activeProjectName = nil
local lastFingerprint = nil
local lastContextSentAt = 0

local function getApiBase()
	local v = plugin:GetSetting("bs_api_base")
	if type(v) == "string" and v ~= "" then return v end
	return DEFAULT_API
end
local function setApiBase(v) plugin:SetSetting("bs_api_base", v) end

----------------------------------------------------------------
-- Toolbar / widget
----------------------------------------------------------------
local PLUGIN_VERSION = "1.4.1"
print(string.format("[BloxSmith] plugin loaded v%s — look for the BloxSmith button in the PLUGINS tab.", PLUGIN_VERSION))

local toolbar = plugin:CreateToolbar("BloxSmith")
local button  = toolbar:CreateButton("BloxSmith", "Open BloxSmith AI",
	"rbxasset://textures/StudioToolbox/Search.png")
button.ClickableWhenViewportHidden = true

local widgetInfo = DockWidgetPluginGuiInfo.new(
	Enum.InitialDockState.Right, false, false, 320, 460, 300, 420)
local widget = plugin:CreateDockWidgetPluginGui("BloxSmith_v14", widgetInfo)
widget.Title = "BloxSmith AI v" .. PLUGIN_VERSION

local function getToken()    return plugin:GetSetting("bs_token")    or "" end
local function setToken(v)   plugin:SetSetting("bs_token", v) end
local function getConsent()  return plugin:GetSetting("bs_consent_v1") == true end
local function setConsent(v) plugin:SetSetting("bs_consent_v1", v) end
local function getPaused()   return plugin:GetSetting("bs_paused") == true end
local function setPaused(v)  plugin:SetSetting("bs_paused", v) end
local function getPreview()  return plugin:GetSetting("bs_preview") == true end
local function setPreview(v) plugin:SetSetting("bs_preview", v) end
-- Clear Mode: when ON, the plugin ONLY applies incoming actions. It will
-- never scan/push your project files, never re-materialize file lists,
-- and never auto-send workspace context. Useful when the sync is noisy
-- or you only want the AI to push changes you've explicitly asked for.
local function getClearMode()  return plugin:GetSetting("bs_clear_mode") == true end
local function setClearMode(v) plugin:SetSetting("bs_clear_mode", v) end

-- Ignore filters: comma-separated locations / folder names to exclude from
-- snapshot scans, organize plans, and any applied move/rename/organize/clean
-- actions. Patterns are matched case-insensitively against either a full
-- path segment OR as a substring of the full instance path.
-- Example: "StarterPlayer, Archive, _wip"
local function getIgnoresRaw() return plugin:GetSetting("bs_ignores") or "" end
local function setIgnoresRaw(v) plugin:SetSetting("bs_ignores", tostring(v or "")) end
local function getIgnoreList()
	local out = {}
	for token in string.gmatch(getIgnoresRaw(), "([^,]+)") do
		local t = token:gsub("^%s+", ""):gsub("%s+$", "")
		if t ~= "" then table.insert(out, string.lower(t)) end
	end
	return out
end
local function pathIsIgnored(path)
	if not path or path == "" then return false end
	local list = getIgnoreList()
	if #list == 0 then return false end
	local lower = string.lower(path)
	local segments = {}
	for seg in string.gmatch(lower, "([^/.]+)") do table.insert(segments, seg) end
	for _, pat in ipairs(list) do
		for _, seg in ipairs(segments) do
			if seg == pat then return true end
		end
		if string.find(lower, pat, 1, true) then return true end
	end
	return false
end

local function postJSON(path, body)
	local apiBase = getApiBase()
	local url = apiBase .. path
	if string.sub(path, 1, 12) == "/api/studio/" then
		local hostBase = string.gsub(apiBase, "/api/public/plugin", "")
		url = hostBase .. path
	end

	local ok, res = pcall(function()
		return HttpService:RequestAsync({
			Url = url, Method = "POST",
			Headers = {
				["Content-Type"]  = "application/json",
				["x-plugin-token"] = getToken(),
			},
			Body = HttpService:JSONEncode(body or {}),
		})
	end)
	if not ok then return nil, tostring(res) end
	if not res.Success then return nil, "HTTP " .. tostring(res.StatusCode) end
	local okDecode, decoded = pcall(function() return HttpService:JSONDecode(res.Body) end)
	if not okDecode then return nil, "Bad JSON" end
	return decoded
end

----------------------------------------------------------------
-- UI (polished)
----------------------------------------------------------------
local C = {
	bg        = Color3.fromRGB(8, 9, 13),
	panel     = Color3.fromRGB(20, 21, 28),
	panelHi   = Color3.fromRGB(28, 29, 38),
	stroke    = Color3.fromRGB(42, 44, 56),
	strokeHi  = Color3.fromRGB(62, 64, 80),
	primary   = Color3.fromRGB(124, 110, 248),
	primaryHi = Color3.fromRGB(150, 138, 255),
	disconnect= Color3.fromRGB(34, 36, 46),
	text      = Color3.fromRGB(245, 246, 252),
	textDim   = Color3.fromRGB(170, 174, 192),
	textMute  = Color3.fromRGB(110, 114, 132),
	accent    = Color3.fromRGB(180, 170, 255),
	success   = Color3.fromRGB(74, 222, 168),
	warn      = Color3.fromRGB(245, 180, 90),
	idle      = Color3.fromRGB(110, 114, 132),
}

local UI_Elements = {
	bg = {},
	panel = {},
	text = {},
	textDim = {},
	textMute = {},
	stroke = {},
}

local function register(element, category)
	if not UI_Elements[category] then UI_Elements[category] = {} end
	table.insert(UI_Elements[category], element)
end

local function corner(p, r) local c = Instance.new("UICorner", p); c.CornerRadius = UDim.new(0, r or 6); return c end
local function stroke(p, col, t)
	local s = Instance.new("UIStroke", p)
	s.Color = col or C.stroke
	s.Thickness = t or 1
	s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	register(s, "stroke")
	return s
end
local function padAll(p, n) local u = Instance.new("UIPadding", p); u.PaddingTop = UDim.new(0,n); u.PaddingBottom = UDim.new(0,n); u.PaddingLeft = UDim.new(0,n); u.PaddingRight = UDim.new(0,n); return u end

-- Premium helpers ------------------------------------------------
-- Diagonal gradient fill (used on logo + primary button for depth).
local function gradient(p, c1, c2, rot)
	local g = Instance.new("UIGradient", p)
	g.Color = ColorSequence.new(c1, c2)
	g.Rotation = rot or 115
	return g
end

-- Soft drop shadow behind a frame, via a sliced shadow image.
local function shadow(p, transparency, spread)
	local s = Instance.new("ImageLabel")
	s.Name = "Shadow"
	s.BackgroundTransparency = 1
	s.Image = "rbxasset://textures/ui/Controls/DropShadow.png"
	s.ScaleType = Enum.ScaleType.Slice
	s.SliceCenter = Rect.new(12, 12, 13, 13)
	s.ImageColor3 = Color3.new(0, 0, 0)
	s.ImageTransparency = transparency or 0.62
	s.ZIndex = 0
	local sp = spread or 11
	s.Size = UDim2.new(1, sp * 2, 1, sp * 2)
	s.Position = UDim2.new(0, -sp, 0, -sp + 3)
	s.Parent = p
	return s
end

-- Vertical sheen on a panel — lighter at top, reads as a lit surface.
-- Pure UIGradient (not a GuiObject), so it never disturbs UIListLayout.
local function sheen(p)
	local g = Instance.new("UIGradient", p)
	g.Rotation = 90
	g.Color = ColorSequence.new({
		ColorSequenceKeypoint.new(0, Color3.fromRGB(255, 255, 255)),
		ColorSequenceKeypoint.new(1, Color3.fromRGB(225, 225, 235)),
	})
	g.Transparency = NumberSequence.new(0)
	return g
end

local scroll = Instance.new("ScrollingFrame", widget)
scroll.Size = UDim2.fromScale(1,1)
scroll.BackgroundColor3 = C.bg
scroll.BackgroundTransparency = 0
scroll.BorderSizePixel = 0
scroll.ScrollBarThickness = 3
scroll.ScrollBarImageColor3 = C.strokeHi
scroll.ScrollBarImageTransparency = 0.3
scroll.CanvasSize = UDim2.fromScale(0,0)
scroll.AutomaticCanvasSize = Enum.AutomaticSize.Y
padAll(scroll, 14)
register(scroll, "bg")

local root = Instance.new("Frame", scroll)
root.Size = UDim2.new(1,0,0,0)
root.AutomaticSize = Enum.AutomaticSize.Y
root.BackgroundTransparency = 1
root.BorderSizePixel = 0

local list = Instance.new("UIListLayout", root)
list.Padding = UDim.new(0,10)
list.SortOrder = Enum.SortOrder.LayoutOrder

-- Header: logo + title + status pill
local header = Instance.new("Frame", root)
header.LayoutOrder = 1
header.BackgroundTransparency = 1
header.Size = UDim2.new(1,0,0,32)

local logo = Instance.new("Frame", header)
logo.Size = UDim2.fromOffset(28, 28)
logo.Position = UDim2.new(0,0,0.5,-14)
logo.BackgroundColor3 = C.primary
logo.BorderSizePixel = 0
corner(logo, 8)
gradient(logo, Color3.fromRGB(160, 142, 255), Color3.fromRGB(96, 78, 240), 130)
local logoGlow = Instance.new("UIStroke", logo)
logoGlow.Color = Color3.fromRGB(170, 152, 255)
logoGlow.Thickness = 1
logoGlow.Transparency = 0.4
shadow(logo, 0.78, 6)
local logoText = Instance.new("TextLabel", logo)
logoText.BackgroundTransparency = 1; logoText.Size = UDim2.fromScale(1,1)
logoText.Font = Enum.Font.BuilderSansBold; logoText.TextSize = 15
logoText.TextColor3 = Color3.new(1,1,1); logoText.Text = "B"

local title = Instance.new("TextLabel", header)
title.BackgroundTransparency = 1
title.Position = UDim2.new(0,38,0,0)
title.Size = UDim2.new(1,-138,1,0)
title.Font = Enum.Font.BuilderSansBold; title.TextSize = 14
title.TextColor3 = C.text
register(title, "text")
title.Text = "BloxSmith AI"
title.TextXAlignment = Enum.TextXAlignment.Left
title.TextYAlignment = Enum.TextYAlignment.Center

local pill = Instance.new("Frame", header)
pill.AnchorPoint = Vector2.new(1, 0.5)
pill.Position = UDim2.new(1, 0, 0.5, 0)
pill.Size = UDim2.fromOffset(96, 24)
pill.BackgroundColor3 = C.panel
register(pill, "panel")
pill.BorderSizePixel = 0
corner(pill, 12)
stroke(pill, C.stroke, 1)

local pillDot = Instance.new("Frame", pill)
pillDot.Size = UDim2.fromOffset(6,6)
pillDot.Position = UDim2.new(0, 12, 0.5, -3)
pillDot.BackgroundColor3 = C.idle
pillDot.BorderSizePixel = 0
corner(pillDot, 3)
local pillDotGlow = Instance.new("UIStroke", pillDot)
pillDotGlow.Color = C.idle
pillDotGlow.Thickness = 2
pillDotGlow.Transparency = 0.55

local pillText = Instance.new("TextLabel", pill)
pillText.BackgroundTransparency = 1
pillText.Position = UDim2.new(0, 24, 0, 0)
pillText.Size = UDim2.new(1, -30, 1, 0)
pillText.Font = Enum.Font.BuilderSansMedium; pillText.TextSize = 11
pillText.TextColor3 = C.textDim
pillText.Text = "Offline"
pillText.TextXAlignment = Enum.TextXAlignment.Left

local subtitle = Instance.new("TextLabel", root)
subtitle.LayoutOrder = 2
subtitle.BackgroundTransparency = 1
subtitle.Size = UDim2.new(1,0,0,14)
subtitle.Font = Enum.Font.BuilderSans; subtitle.TextSize = 11
subtitle.TextColor3 = C.textMute
register(subtitle, "textMute")
subtitle.Text = "Build Roblox games with AI"
subtitle.TextXAlignment = Enum.TextXAlignment.Left

-- Live credit balance pill — refreshes after auth, after each sync, and on
-- a slow timer so users always see how many credits they have left without
-- leaving Studio.
local creditsRow = Instance.new("Frame", root)
creditsRow.LayoutOrder = 2
creditsRow.BackgroundTransparency = 1
creditsRow.Size = UDim2.new(1,0,0,22)

local creditsChip = Instance.new("Frame", creditsRow)
creditsChip.AnchorPoint = Vector2.new(0, 0.5)
creditsChip.Position = UDim2.new(0, 0, 0.5, 0)
creditsChip.AutomaticSize = Enum.AutomaticSize.X
creditsChip.Size = UDim2.fromOffset(0, 20)
creditsChip.BackgroundColor3 = C.panel
register(creditsChip, "panel")
creditsChip.BorderSizePixel = 0
corner(creditsChip, 10)
stroke(creditsChip, C.stroke, 1)

local creditsPad = Instance.new("UIPadding", creditsChip)
creditsPad.PaddingLeft = UDim.new(0, 10)
creditsPad.PaddingRight = UDim.new(0, 10)

local creditsLabel = Instance.new("TextLabel", creditsChip)
creditsLabel.BackgroundTransparency = 1
creditsLabel.AutomaticSize = Enum.AutomaticSize.X
creditsLabel.Size = UDim2.new(0, 0, 1, 0)
creditsLabel.Font = Enum.Font.BuilderSansMedium
creditsLabel.TextSize = 11
creditsLabel.TextColor3 = C.text
creditsLabel.TextXAlignment = Enum.TextXAlignment.Left
creditsLabel.Text = "◆ Credits: —"

local function setCreditsDisplay(n)
	if n == nil then
		creditsLabel.Text = "◆ Credits: —"
		creditsLabel.TextColor3 = C.textDim
		return
	end
	creditsLabel.Text = "◆ Credits: " .. tostring(n)
	creditsLabel.TextColor3 = (n <= 5) and C.warn or C.text
end

local lastCreditsAt = 0
local function refreshCredits(force)
	if getToken() == "" then setCreditsDisplay(nil); return end
	local now = os.time()
	if not force and (now - lastCreditsAt) < 8 then return end
	lastCreditsAt = now
	task.spawn(function()
		local data = postJSON("/credits", {})
		if data and data.credits ~= nil then
			setCreditsDisplay(data.credits)
		end
	end)
end



-- Token label + input
local tokenLabel = Instance.new("TextLabel", root)
tokenLabel.LayoutOrder = 3
tokenLabel.BackgroundTransparency = 1
tokenLabel.Size = UDim2.new(1,0,0,16)
tokenLabel.Font = Enum.Font.BuilderSansBold; tokenLabel.TextSize = 10
tokenLabel.TextColor3 = C.textDim
register(tokenLabel, "textDim")
tokenLabel.Text = "PLUGIN TOKEN"
tokenLabel.TextXAlignment = Enum.TextXAlignment.Left

local tokenWrap = Instance.new("Frame", root)
tokenWrap.LayoutOrder = 4
tokenWrap.Size = UDim2.new(1,0,0,36)
tokenWrap.BackgroundColor3 = C.panel
register(tokenWrap, "panel")
tokenWrap.BorderSizePixel = 0
corner(tokenWrap, 10)
local tokenStroke = stroke(tokenWrap, C.stroke, 1)

local tokenBox = Instance.new("TextBox", tokenWrap)
tokenBox.Size = UDim2.new(1,-24,1,0)
tokenBox.Position = UDim2.new(0,12,0,0)
tokenBox.BackgroundTransparency = 1
tokenBox.TextColor3 = C.text
register(tokenBox, "text")
tokenBox.Text = getToken()
tokenBox.PlaceholderText = "Paste your plugin token"
tokenBox.PlaceholderColor3 = C.textMute
tokenBox.Font = Enum.Font.Code; tokenBox.TextSize = 12
tokenBox.ClearTextOnFocus = false
tokenBox.TextXAlignment = Enum.TextXAlignment.Left
tokenBox.Focused:Connect(function() tokenStroke.Color = C.primary; tokenStroke.Thickness = 1.5 end)
tokenBox.FocusLost:Connect(function() tokenStroke.Color = C.stroke; tokenStroke.Thickness = 1 end)

-- Primary button
local connectBtn = Instance.new("TextButton", root)
connectBtn.LayoutOrder = 5
connectBtn.Size = UDim2.new(1,0,0,38)
connectBtn.BackgroundColor3 = C.primary
connectBtn.TextColor3 = Color3.new(1,1,1)
connectBtn.Text = "Connect"
connectBtn.Font = Enum.Font.BuilderSansBold; connectBtn.TextSize = 13
connectBtn.BorderSizePixel = 0
connectBtn.AutoButtonColor = false
corner(connectBtn, 10)
shadow(connectBtn, 0.7, 10)
local connectGrad = gradient(connectBtn,
	Color3.fromRGB(140, 124, 255), Color3.fromRGB(96, 80, 240), 115)
connectBtn:SetAttribute("Base", "primary")
connectBtn.MouseEnter:Connect(function()
	if connectBtn:GetAttribute("Base") == "primary" then
		connectGrad.Color = ColorSequence.new(
			Color3.fromRGB(160, 146, 255), Color3.fromRGB(116, 100, 250))
	else
		connectBtn.BackgroundColor3 = C.strokeHi
	end
end)
connectBtn.MouseLeave:Connect(function()
	if connectBtn:GetAttribute("Base") == "primary" then
		connectGrad.Color = ColorSequence.new(
			Color3.fromRGB(140, 124, 255), Color3.fromRGB(96, 80, 240))
	else
		connectBtn.BackgroundColor3 = C.disconnect
	end
end)

-- Info card
local card = Instance.new("Frame", root)
card.LayoutOrder = 6
card.Size = UDim2.new(1,0,0,132)
card.BackgroundColor3 = C.panel
register(card, "panel")
card.BorderSizePixel = 0
corner(card, 12)
stroke(card, C.stroke, 1)
sheen(card)
padAll(card, 14)
local cardList = Instance.new("UIListLayout", card); cardList.Padding = UDim.new(0,7)

local function infoRow(order, labelText)
	local row = Instance.new("Frame", card)
	row.LayoutOrder = order
	row.BackgroundTransparency = 1
	row.Size = UDim2.new(1,0,0,16)
	local lbl = Instance.new("TextLabel", row)
	lbl.BackgroundTransparency = 1
	lbl.Size = UDim2.new(0,64,1,0)
	lbl.Font = Enum.Font.BuilderSansBold; lbl.TextSize = 10
	lbl.TextColor3 = C.textMute
	register(lbl, "textMute")
	lbl.Text = labelText
	lbl.TextXAlignment = Enum.TextXAlignment.Left
	local val = Instance.new("TextLabel", row)
	val.BackgroundTransparency = 1
	val.Position = UDim2.new(0,70,0,0)
	val.Size = UDim2.new(1,-70,1,0)
	val.Font = Enum.Font.BuilderSans; val.TextSize = 11
	val.TextColor3 = C.text
	register(val, "text")
	val.Text = "—"
	val.TextXAlignment = Enum.TextXAlignment.Left
	val.TextTruncate = Enum.TextTruncate.AtEnd
	return val
end

local status   = infoRow(1, "STATUS")
local syncInfo = infoRow(2, "BUILDS")
local ctxInfo  = infoRow(3, "CONTEXT")
local logInfo  = infoRow(4, "LOG")
status.Text = "Not connected"
local recentLogs = {}

local function appendLog(message)
	local text = os.date("%H:%M:%S") .. " " .. tostring(message)
	table.insert(recentLogs, 1, text)
	while #recentLogs > 4 do table.remove(recentLogs) end
	logInfo.Text = recentLogs[1] or "—"
	print("[BloxSmith] " .. tostring(message))
end

-- Session counters + last-sync heartbeat. Reset every plugin load. Surfaced
-- in the STATS info row so the user can tell at a glance how many actions
-- actually landed vs. failed without scrolling through the log buffer.
local statsApplied, statsSkipped, statsErrors = 0, 0, 0
local lastSyncAt = 0
local statsInfo = infoRow(5, "STATS")
local function refreshStatsInfo()
	local agoText
	if lastSyncAt == 0 then
		agoText = "never"
	else
		local d = os.time() - lastSyncAt
		if d < 2 then agoText = "just now"
		elseif d < 60 then agoText = d .. "s ago"
		elseif d < 3600 then agoText = math.floor(d/60) .. "m ago"
		else agoText = math.floor(d/3600) .. "h ago"
		end
	end
	statsInfo.Text = ("Applied %d · Skipped %d · Errors %d · Last sync: %s"):format(
		statsApplied, statsSkipped, statsErrors, agoText)
end
refreshStatsInfo()
task.spawn(function()
	while true do
		task.wait(2)
		pcall(refreshStatsInfo)
	end
end)

local footer = Instance.new("TextLabel", root)
footer.LayoutOrder = 7
footer.BackgroundTransparency = 1
footer.Size = UDim2.new(1,0,0,32)
footer.Font = Enum.Font.BuilderSans; footer.TextSize = 10
footer.TextColor3 = C.textMute
register(footer, "textMute")
footer.Text = "bloxsmith.pro · sends script source + workspace snapshot to BloxSmith's AI. You can pause or disconnect at any time. All changes are undoable (Ctrl+Z)."
footer.TextWrapped = true
footer.TextXAlignment = Enum.TextXAlignment.Left
footer.TextYAlignment = Enum.TextYAlignment.Top

-- Custom API URL (for self-hosted / staging users; default = bloxsmith.pro)
local apiLabel = Instance.new("TextLabel", root)
apiLabel.LayoutOrder = 8
apiLabel.BackgroundTransparency = 1
apiLabel.Size = UDim2.new(1,0,0,14)
apiLabel.Font = Enum.Font.BuilderSansBold; apiLabel.TextSize = 10
apiLabel.TextColor3 = C.textDim
register(apiLabel, "textDim")
apiLabel.Text = "API URL (advanced — leave default)"
apiLabel.TextXAlignment = Enum.TextXAlignment.Left

local apiWrap = Instance.new("Frame", root)
apiWrap.LayoutOrder = 9
apiWrap.Size = UDim2.new(1,0,0,32)
apiWrap.BackgroundColor3 = C.panel
register(apiWrap, "panel")
apiWrap.BorderSizePixel = 0
corner(apiWrap, 10)
stroke(apiWrap, C.stroke, 1)
local apiBox = Instance.new("TextBox", apiWrap)
apiBox.Size = UDim2.new(1,-24,1,0); apiBox.Position = UDim2.new(0,12,0,0)
apiBox.BackgroundTransparency = 1
apiBox.TextColor3 = C.textDim
register(apiBox, "textDim")
apiBox.Text = getApiBase()
apiBox.PlaceholderText = DEFAULT_API
apiBox.PlaceholderColor3 = C.textMute
apiBox.Font = Enum.Font.Code; apiBox.TextSize = 10
apiBox.ClearTextOnFocus = false
apiBox.TextXAlignment = Enum.TextXAlignment.Left
apiBox.FocusLost:Connect(function() setApiBase(apiBox.Text or "") end)

-- Pause/resume toggle (lets the user stop incoming actions without losing the token)
local pauseBtn = Instance.new("TextButton", root)
pauseBtn.LayoutOrder = 10
pauseBtn.Size = UDim2.new(1,0,0,30)
pauseBtn.BackgroundColor3 = C.panel
register(pauseBtn, "panel")
pauseBtn.TextColor3 = C.textDim
register(pauseBtn, "textDim")
pauseBtn.Text = getPaused() and "▶  Resume sync" or "⏸  Pause sync"
pauseBtn.Font = Enum.Font.BuilderSansMedium; pauseBtn.TextSize = 11
pauseBtn.BorderSizePixel = 0
pauseBtn.AutoButtonColor = false
corner(pauseBtn, 10)
stroke(pauseBtn, C.stroke, 1)
pauseBtn.MouseButton1Click:Connect(function()
	setPaused(not getPaused())
	pauseBtn.Text = getPaused() and "▶  Resume sync" or "⏸  Pause sync"
end)

local utilityRow = Instance.new("Frame", root)
utilityRow.LayoutOrder = 11
utilityRow.BackgroundTransparency = 1
utilityRow.Size = UDim2.new(1,0,0,30)
local utilityList = Instance.new("UIListLayout", utilityRow)
utilityList.FillDirection = Enum.FillDirection.Horizontal
utilityList.Padding = UDim.new(0,6)
utilityList.SortOrder = Enum.SortOrder.LayoutOrder

local function utilityButton(parent, text, widthScale, order)
	local b = Instance.new("TextButton", parent)
	b.LayoutOrder = order
	b.Size = UDim2.new(widthScale, -4, 1, 0)
	b.BackgroundColor3 = C.panel
	register(b, "panel")
	b.TextColor3 = C.textDim
	register(b, "textDim")
	b.Text = text
	b.Font = Enum.Font.BuilderSansMedium
	b.TextSize = 10
	b.BorderSizePixel = 0
	b.AutoButtonColor = false
	corner(b, 8)
	local s = stroke(b, C.stroke, 1)
	b.MouseEnter:Connect(function() s.Color = C.strokeHi; b.BackgroundColor3 = C.panelHi end)
	b.MouseLeave:Connect(function() s.Color = C.stroke; b.BackgroundColor3 = C.panel end)
	return b
end

local syncNowBtn      = utilityButton(utilityRow, "Sync Now",     0.2, 1)
local reconnectBtn    = utilityButton(utilityRow, "Reconnect",    0.2, 2)
local cancelScanBtn   = utilityButton(utilityRow, "Cancel Scan",  0.2, 3)
local cleanSyncedBtn  = utilityButton(utilityRow, "Clean Synced", 0.2, 4)
local testConnBtn     = utilityButton(utilityRow, "Test",         0.2, 5)

-- Preview mode row: when ON, incoming AI actions are stashed locally so you
-- can review every script + change before it touches your place. Stays in
-- Studio edit mode (never enters Play).
local previewRow = Instance.new("Frame", root)
previewRow.LayoutOrder = 12
previewRow.BackgroundTransparency = 1
previewRow.Size = UDim2.new(1,0,0,30)
local previewList = Instance.new("UIListLayout", previewRow)
previewList.FillDirection = Enum.FillDirection.Horizontal
previewList.Padding = UDim.new(0,6)
previewList.SortOrder = Enum.SortOrder.LayoutOrder

local previewToggleBtn = utilityButton(previewRow, "", 0.5, 1)
local reviewBtn        = utilityButton(previewRow, "Review Pending (0)", 0.5, 2)

local function refreshPreviewToggleLabel()
	previewToggleBtn.Text = getPreview() and "👁  Preview Mode: ON" or "👁  Preview Mode: OFF"
	if getPreview() then
		previewToggleBtn.TextColor3 = C.accent
	else
		previewToggleBtn.TextColor3 = C.textDim
	end
end
refreshPreviewToggleLabel()

-- Clear Mode row: when ON, the plugin acts as an apply-only client.
-- No project scans, no snapshot uploads, no auto-context — incoming
-- build actions are still executed (or queued in Preview Mode).
local clearRow = Instance.new("Frame", root)
clearRow.LayoutOrder = 13
clearRow.BackgroundTransparency = 1
clearRow.Size = UDim2.new(1,0,0,30)
local clearList = Instance.new("UIListLayout", clearRow)
clearList.FillDirection = Enum.FillDirection.Horizontal
clearList.Padding = UDim.new(0,6)
clearList.SortOrder = Enum.SortOrder.LayoutOrder

local clearModeBtn = utilityButton(clearRow, "", 1, 1)
local function refreshClearModeLabel()
	clearModeBtn.Text = getClearMode()
		and "🧹  Clear Mode: ON  (apply-only, no file sync)"
		or  "🧹  Clear Mode: OFF  (full sync)"
	clearModeBtn.TextColor3 = getClearMode() and C.accent or C.textDim
end
refreshClearModeLabel()
clearModeBtn.MouseButton1Click:Connect(function()
	setClearMode(not getClearMode())
	refreshClearModeLabel()
	if getClearMode() then
		appendLog("Clear Mode enabled — file sync disabled")
		syncInfo.Text = "Clear Mode — apply-only"
	else
		appendLog("Clear Mode disabled — full sync resumed")
	end
end)

-- Organize Workspace row: asks the BloxSmith AI to plan organize / move /
-- rename actions for the current project's live workspace snapshot. The
-- resulting actions land in the normal pull queue and apply automatically.
local organizeRow = Instance.new("Frame", root)
organizeRow.LayoutOrder = 14
organizeRow.BackgroundTransparency = 1
organizeRow.Size = UDim2.new(1,0,0,30)
local organizeList = Instance.new("UIListLayout", organizeRow)
organizeList.FillDirection = Enum.FillDirection.Horizontal
organizeList.Padding = UDim.new(0,6)
organizeList.SortOrder = Enum.SortOrder.LayoutOrder

local organizeBtn = utilityButton(organizeRow, "🗂  Organize Workspace (AI)", 1, 1)
organizeBtn.TextColor3 = C.accent

organizeBtn.MouseButton1Click:Connect(function()
	if not connected or not activeProjectId then
		syncInfo.Text = "Connect a project before organizing"
		appendLog("Organize requested while offline")
		return
	end
	organizeBtn.Text = "🗂  Organizing…"
	organizeBtn.TextColor3 = C.textDim
	appendLog("Organize Workspace requested")
	task.spawn(function()
		-- Make sure the server has a fresh snapshot to plan against, unless
		-- the user has Clear Mode on (in which case we trust whatever the
		-- server last saw).
		if not getClearMode() then
			pcall(pushSnapshot)
		end
		local data, err = postJSON("/organize", { projectId = activeProjectId, ignores = getIgnoreList() })
		if err then
			organizeBtn.Text = "🗂  Organize Workspace (AI)"
			organizeBtn.TextColor3 = C.accent
			syncInfo.Text = "Organize error: " .. tostring(err)
			appendLog("Organize error: " .. tostring(err))
			return
		end
		local queued = (data and data.queued) or 0
		local msg = (data and data.message) or ("Queued " .. tostring(queued) .. " action(s).")
		syncInfo.Text = msg
		appendLog("Organize: " .. msg)
		organizeBtn.Text = "🗂  Organize Workspace (AI)"
		organizeBtn.TextColor3 = C.accent
	end)
end)

-- Ignore Filters row: comma-separated list of services / folder names / path
-- substrings to exclude from scans, organize plans, and any applied actions.
local ignoreLabel = Instance.new("TextLabel", root)
ignoreLabel.LayoutOrder = 15
ignoreLabel.BackgroundTransparency = 1
ignoreLabel.Size = UDim2.new(1,0,0,14)
ignoreLabel.Font = Enum.Font.BuilderSansBold; ignoreLabel.TextSize = 10
ignoreLabel.TextColor3 = C.textDim
register(ignoreLabel, "textDim")
ignoreLabel.Text = "IGNORE FILTERS  (comma-separated)"
ignoreLabel.TextXAlignment = Enum.TextXAlignment.Left

local ignoreWrap = Instance.new("Frame", root)
ignoreWrap.LayoutOrder = 16
ignoreWrap.Size = UDim2.new(1,0,0,32)
ignoreWrap.BackgroundColor3 = C.panel
register(ignoreWrap, "panel")
ignoreWrap.BorderSizePixel = 0
corner(ignoreWrap, 10)
local ignoreStroke = stroke(ignoreWrap, C.stroke, 1)

local ignoreBox = Instance.new("TextBox", ignoreWrap)
ignoreBox.Size = UDim2.new(1,-24,1,0)
ignoreBox.Position = UDim2.new(0,12,0,0)
ignoreBox.BackgroundTransparency = 1
ignoreBox.TextColor3 = C.text
register(ignoreBox, "text")
ignoreBox.Text = getIgnoresRaw()
ignoreBox.PlaceholderText = "e.g. StarterPlayer, Archive, _wip"
ignoreBox.PlaceholderColor3 = C.textMute
ignoreBox.Font = Enum.Font.Code; ignoreBox.TextSize = 11
ignoreBox.ClearTextOnFocus = false
ignoreBox.TextXAlignment = Enum.TextXAlignment.Left
ignoreBox.Focused:Connect(function() ignoreStroke.Color = C.primary; ignoreStroke.Thickness = 1.5 end)
ignoreBox.FocusLost:Connect(function(enter)
	ignoreStroke.Color = C.stroke; ignoreStroke.Thickness = 1
	setIgnoresRaw(ignoreBox.Text)
	local n = #getIgnoreList()
	appendLog("Ignore filters saved (" .. n .. " pattern" .. (n == 1 and "" or "s") .. ")")
end)



local function setPill(state)
	local dotColor, label, textColor
	if state == "connected" or state == "idle" then
		dotColor, label, textColor = C.success, "Connected", C.success
	elseif state == "connecting" then
		dotColor, label, textColor = C.accent, "Connecting", C.accent
	elseif state == "scanning" then
		dotColor, label, textColor = C.accent, "Scanning", C.accent
	elseif state == "executing" then
		dotColor, label, textColor = C.accent, "Executing", C.accent
	elseif state == "complete" then
		dotColor, label, textColor = C.success, "Complete", C.success
	elseif state == "error" then
		dotColor = Color3.fromRGB(240, 80, 80)
		label, textColor = "Error", Color3.fromRGB(240, 80, 80)
	else
		dotColor, label, textColor = C.idle, "Offline", C.textDim
	end
	pillDot.BackgroundColor3 = dotColor
	pillDotGlow.Color = dotColor
	pillText.Text = label
	pillText.TextColor3 = textColor
end

-- Automatic Studio theme sync
local function applyTheme()
	local isLight = false
	pcall(function()
		local theme = settings().Studio.Theme
		isLight = (theme:GetColor(Enum.StudioStyleGuideColor.MainBackground).R > 0.5)
	end)

	if isLight then
		C.bg         = Color3.fromRGB(245, 245, 250)
		C.panel      = Color3.fromRGB(255, 255, 255)
		C.stroke     = Color3.fromRGB(210, 210, 222)
		C.primary    = Color3.fromRGB(99, 91, 255)
		C.primaryHi  = Color3.fromRGB(124, 116, 255)
		C.disconnect = Color3.fromRGB(110, 110, 130)
		C.text       = Color3.fromRGB(30, 30, 45)
		C.textDim    = Color3.fromRGB(80, 80, 100)
		C.textMute   = Color3.fromRGB(140, 140, 160)
		C.accent     = Color3.fromRGB(110, 100, 220)
	else
		C.bg         = Color3.fromRGB(13, 13, 24)
		C.panel      = Color3.fromRGB(22, 22, 38)
		C.stroke     = Color3.fromRGB(45, 45, 70)
		C.primary    = Color3.fromRGB(99, 91, 255)
		C.primaryHi  = Color3.fromRGB(124, 116, 255)
		C.disconnect = Color3.fromRGB(60, 60, 90)
		C.text       = Color3.fromRGB(235, 235, 245)
		C.textDim    = Color3.fromRGB(150, 150, 175)
		C.textMute   = Color3.fromRGB(105, 105, 130)
		C.accent     = Color3.fromRGB(160, 150, 255)
	end

	scroll.BackgroundColor3 = C.bg
	for _, el in ipairs(UI_Elements.bg or {}) do el.BackgroundColor3 = C.bg end
	for _, el in ipairs(UI_Elements.panel or {}) do el.BackgroundColor3 = C.panel end
	for _, el in ipairs(UI_Elements.text or {}) do el.TextColor3 = C.text end
	for _, el in ipairs(UI_Elements.textDim or {}) do el.TextColor3 = C.textDim end
	for _, el in ipairs(UI_Elements.textMute or {}) do el.TextColor3 = C.textMute end
	for _, el in ipairs(UI_Elements.stroke or {}) do el.Color = C.stroke end
end

pcall(function()
	settings().Studio.ThemeChanged:Connect(applyTheme)
end)
applyTheme()
----------------------------------------------------------------
-- Helpers: services, path resolution, value coercion
----------------------------------------------------------------
local SERVICE_MAP = {
	Workspace = Workspace, ServerScriptService = ServerScriptService,
	ServerStorage = ServerStorage, ReplicatedStorage = ReplicatedStorage,
	ReplicatedFirst = ReplicatedFirst, StarterPlayer = StarterPlayer,
	StarterPlayerScripts = StarterPlayer:FindFirstChild("StarterPlayerScripts"),
	StarterCharacterScripts = StarterPlayer:FindFirstChild("StarterCharacterScripts"),
	StarterGui = StarterGui, StarterPack = StarterPack,
	Lighting = Lighting, SoundService = SoundService, Teams = Teams, Terrain = Terrain,
}

local function getService(name)
	if not name or name == "" then return ServerScriptService end
	local s = SERVICE_MAP[name]
	if s then return s end
	local ok, svc = pcall(function() return game:GetService(name) end)
	if ok and svc then return svc end
	return game:FindFirstChild(name)
end

-- Resolve "ServerScriptService.Folder.Sub" or {"ServerScriptService","Folder"} or "ServerScriptService/Folder/Sub"
local function resolvePath(pathStr, createFolders)
	if typeof(pathStr) == "table" then pathStr = table.concat(pathStr, ".") end
	if not pathStr or pathStr == "" or pathStr == "Workspace" then
		pathStr = "Workspace.BloxSmithBuilds"
	end
	pathStr = string.gsub(pathStr, "/", ".")
	pathStr = string.gsub(pathStr, "^game%.", "")
	local parts = string.split(pathStr, ".")
	local parent = getService(parts[1])
	if not parent then return nil end
	for i = 2, #parts do
		local child = parent:FindFirstChild(parts[i])
		if not child then
			if createFolders then
				child = Instance.new("Folder"); child.Name = parts[i]; child.Parent = parent
			else
				return nil
			end
		end
		parent = child
	end
	return parent
end

-- Numeric getter that accepts {x=,y=,z=} / {X=,Y=,Z=} / [1,2,3] forms
local function num(t, keyLower, keyUpper, idx, default)
	if type(t) ~= "table" then return default end
	local v = t[keyLower]
	if v == nil then v = t[keyUpper] end
	if v == nil and idx then v = t[idx] end
	if type(v) == "number" then return v end
	return default
end

local function tableLooksLikeXYZ(v)
	if type(v) ~= "table" then return false end
	if v.x ~= nil or v.X ~= nil or v.y ~= nil or v.Y ~= nil or v.z ~= nil or v.Z ~= nil then return true end
	if type(v[1]) == "number" and type(v[2]) == "number" and type(v[3]) == "number" then return true end
	return false
end

local function toVector3(v, fallback)
	if typeof(v) == "Vector3" then return v end
	if type(v) == "table" then
		return Vector3.new(num(v,"x","X",1,0), num(v,"y","Y",2,0), num(v,"z","Z",3,0))
	end
	return fallback or Vector3.new(0,0,0)
end

local function toColor3(v, fallback)
	if typeof(v) == "Color3" then return v end
	if type(v) == "table" then
		local r = num(v,"r","R",1,255)
		local g = num(v,"g","G",2,255)
		local b = num(v,"b","B",3,255)
		if r <= 1 and g <= 1 and b <= 1 then return Color3.new(r,g,b) end
		return Color3.fromRGB(r,g,b)
	end
	return fallback or Color3.fromRGB(255,255,255)
end

local function coerceValue(v)
	if typeof(v) ~= "table" then return v end
	local t = v.__t or v.type
	if t == "Vector3" then return toVector3(v) end
	if t == "Vector2" then return Vector2.new(num(v,"x","X",1,0), num(v,"y","Y",2,0)) end
	if t == "Color3"  then return toColor3(v) end
	if t == "CFrame"  then
		if v.lookAt then
			return CFrame.new(toVector3(v), toVector3(v.lookAt))
		end
		return CFrame.new(num(v,"x","X",1,0), num(v,"y","Y",2,0), num(v,"z","Z",3,0))
			* CFrame.Angles(math.rad(v.rx or v.RX or 0), math.rad(v.ry or v.RY or 0), math.rad(v.rz or v.RZ or 0))
	end
	if t == "UDim2"   then return UDim2.new(v.xs or 0, v.xo or 0, v.ys or 0, v.yo or 0) end
	if t == "UDim"    then return UDim.new(v.s or 0, v.o or 0) end
	if t == "Enum" and v.enum and v.value then
		local ok, e = pcall(function() return Enum[v.enum][v.value] end)
		if ok then return e end
	end
	if t == "BrickColor" then return BrickColor.new(v.name or "Medium stone grey") end
	return v
end

-- Property names whose expected type we can infer when the AI sends a bare table.
local VECTOR3_PROPS = {
	Size=true, Position=true, Velocity=true, RotVelocity=true, AssemblyLinearVelocity=true,
	AssemblyAngularVelocity=true, Orientation=true, PivotOffset=true,
}
local COLOR3_PROPS = {
	Color=true, BackgroundColor3=true, TextColor3=true, BorderColor3=true,
	ImageColor3=true, OutlineColor=true, Ambient=true, OutdoorAmbient=true,
	FogColor=true, ColorShift_Bottom=true, ColorShift_Top=true,
}

local function applyProps(inst, props)
	if not props then return end
	for k, raw in pairs(props) do
		if k == "Parent" and type(raw) == "string" then
			local parentInst = resolvePath(raw, true)
			if parentInst then
				pcall(function() inst.Parent = parentInst end)
			end
		else
			local ok, val = pcall(coerceValue, raw)
			if not ok then val = raw end
			-- Infer expected types when AI sent an untagged table.
			if type(val) == "table" then
				if VECTOR3_PROPS[k] and tableLooksLikeXYZ(val) then
					val = toVector3(val)
				elseif COLOR3_PROPS[k] then
					val = toColor3(val)
				elseif k == "CFrame" and tableLooksLikeXYZ(val) then
					val = CFrame.new(toVector3(val))
				end
			end
			pcall(function() inst[k] = val end)
		end
	end
end

local function showDeleteConfirmDialog(pathText, callback)
	pcall(function() widget.Enabled = true end)
	local overlay = Instance.new("Frame", widget)
	overlay.Size = UDim2.fromScale(1,1)
	overlay.BackgroundColor3 = Color3.new(0,0,0)
	overlay.BackgroundTransparency = 0.35
	overlay.BorderSizePixel = 0
	overlay.ZIndex = 80

	local box = Instance.new("Frame", overlay)
	box.Size = UDim2.new(1,-24,0,154)
	box.Position = UDim2.new(0,12,0.5,-77)
	box.BackgroundColor3 = C.panel
	box.BorderSizePixel = 0
	box.ZIndex = 81
	corner(box, 10); stroke(box, C.stroke, 1); padAll(box, 14)

	local boxList = Instance.new("UIListLayout", box)
	boxList.Padding = UDim.new(0,10)
	boxList.SortOrder = Enum.SortOrder.LayoutOrder

	local h = Instance.new("TextLabel", box)
	h.LayoutOrder = 1
	h.BackgroundTransparency = 1
	h.Size = UDim2.new(1,0,0,20)
	h.Font = Enum.Font.GothamBold
	h.TextSize = 13
	h.TextColor3 = C.text
	h.Text = "Confirm Delete"
	h.TextXAlignment = Enum.TextXAlignment.Left
	h.ZIndex = 82

	local body = Instance.new("TextLabel", box)
	body.LayoutOrder = 2
	body.BackgroundTransparency = 1
	body.Size = UDim2.new(1,0,0,46)
	body.Font = Enum.Font.Gotham
	body.TextSize = 11
	body.TextColor3 = C.textDim
	body.TextWrapped = true
	body.TextXAlignment = Enum.TextXAlignment.Left
	body.TextYAlignment = Enum.TextYAlignment.Top
	body.ZIndex = 82
	body.Text = "BloxSmith wants to delete this object from your Studio place:\n" .. tostring(pathText)

	local row = Instance.new("Frame", box)
	row.LayoutOrder = 3
	row.BackgroundTransparency = 1
	row.Size = UDim2.new(1,0,0,32)
	row.ZIndex = 82

	local keep = Instance.new("TextButton", row)
	keep.Size = UDim2.new(0.5,-4,1,0)
	keep.BackgroundColor3 = C.disconnect
	keep.TextColor3 = C.text
	keep.Font = Enum.Font.GothamMedium
	keep.TextSize = 11
	keep.Text = "Cancel"
	keep.BorderSizePixel = 0
	keep.ZIndex = 83
	corner(keep, 6)

	local del = Instance.new("TextButton", row)
	del.Size = UDim2.new(0.5,-4,1,0)
	del.Position = UDim2.new(0.5,8,0,0)
	del.BackgroundColor3 = Color3.fromRGB(205, 72, 82)
	del.TextColor3 = Color3.new(1,1,1)
	del.Font = Enum.Font.GothamBold
	del.TextSize = 11
	del.Text = "Delete"
	del.BorderSizePixel = 0
	del.ZIndex = 83
	corner(del, 6)

	keep.MouseButton1Click:Connect(function()
		overlay:Destroy()
		callback(false)
	end)
	del.MouseButton1Click:Connect(function()
		overlay:Destroy()
		callback(true)
	end)
end

----------------------------------------------------------------
-- Action handlers — this is what makes the AI actually BUILD
----------------------------------------------------------------
local Actions = {}

-- Apply visibility defaults so generated BaseParts actually show up in Studio
-- (anchored, opaque, collidable, reasonable size, above spawn).
local function applyVisibleDefaults(inst, props)
	if not inst:IsA("BasePart") then return end
	local p = props or {}
	if p.Anchored == nil and inst.Anchored == false then inst.Anchored = true end
	if p.Transparency == nil and inst.Transparency >= 1 then inst.Transparency = 0 end
	if p.CanCollide == nil then inst.CanCollide = true end
	if p.Size == nil and inst.Size.Magnitude < 0.5 then
		inst.Size = Vector3.new(4, 4, 4)
	end
	if p.Position == nil and p.CFrame == nil and inst.Position.Magnitude < 0.01 then
		inst.CFrame = CFrame.new(0, 10, 0)
	end
end

local function pathHas(pathText, words)
	local lower = string.lower(tostring(pathText or ""))
	for _, word in ipairs(words) do
		if string.find(lower, word, 1, true) then return true end
	end
	return false
end

local function ensurePath(pathText)
	return resolvePath(pathText, true)
end

local function normalizePersistentParent(a)
	if not a then return end
	local t = a.type
	local className = tostring(a.className or a.file_type or "")
	local name = tostring(a.name or a.searchQuery or a.assetName or "")
	local parent = tostring(a.parent or a.service_location or "")
	local descriptor = table.concat({ t or "", className, name, parent }, " ")

	if t == "script" then
		if className == "Script" and (parent == "" or parent == "ServerScriptService") then a.parent = "ServerScriptService/Systems" end
		if className == "LocalScript" and (parent == "" or parent == "StarterGui") then a.parent = "StarterGui/BloxsmithUI" end
		return
	end

	if t == "create" then
		if className == "RemoteEvent" or className == "RemoteFunction" then
			if parent == "" or parent == "ReplicatedStorage" then a.parent = "ReplicatedStorage/Remotes" end
		elseif className == "ScreenGui" or className == "BillboardGui" or className == "SurfaceGui" then
			if parent == "" or parent == "StarterGui" then a.parent = "StarterGui/BloxsmithUI" end
		elseif className == "Tool" then
			if parent == "" or parent == "StarterPack" then a.parent = "StarterPack/Tools" end
		elseif className == "Part" or className == "Model" or className == "Folder" or className == "MeshPart" or className == "SpawnLocation" then
			if parent == "" or parent == "Workspace" then
				if pathHas(descriptor, { "npc", "enemy", "zombie", "shopkeeper", "vendor" }) then
					a.parent = "Workspace/NPCs"
				elseif pathHas(descriptor, { "door", "lever", "button", "pickup", "interactable", "zone" }) then
					a.parent = "Workspace/Interactables"
				elseif pathHas(descriptor, { "map", "city", "road", "street", "building", "tree", "grass", "ground", "terrain", "floor", "baseplate", "prop", "decor" }) then
					a.parent = "Workspace/Map"
				else
					a.parent = "Workspace/GeneratedAssets"
				end
			end
		end
		return
	end

	if t == "insertAsset" or t == "insert_toolbox_asset" then
		if parent == "" or parent == "Workspace" then
			if pathHas(descriptor, { "npc", "enemy", "zombie", "character" }) then
				a.parent = "Workspace/NPCs"
			elseif pathHas(descriptor, { "door", "lever", "pickup", "interactable", "zone" }) then
				a.parent = "Workspace/Interactables"
			elseif pathHas(descriptor, { "map", "city", "road", "street", "building", "tree", "grass", "ground", "terrain", "floor", "baseplate", "prop", "decor" }) then
				a.parent = "Workspace/Map"
			else
				a.parent = "Workspace/GeneratedAssets"
			end
		end
	end
end

local function asVector3(v, fallback)
	if typeof(v) == "Vector3" then return v end
	if typeof(v) == "table" then
		if v.__t == "Vector3" or v.type == "Vector3" then return Vector3.new(v.x or 0, v.y or 0, v.z or 0) end
		if #v >= 3 then return Vector3.new(v[1] or 0, v[2] or 0, v[3] or 0) end
	end
	return fallback or Vector3.new(0, 8, 0)
end

local function stabilizeGeneratedInstance(inst)
	if not inst then return end
	if inst:IsA("BasePart") then
		applyVisibleDefaults(inst, nil)
	elseif inst:IsA("Model") or inst:IsA("Folder") then
		for _, desc in ipairs(inst:GetDescendants()) do
			if desc:IsA("BasePart") then applyVisibleDefaults(desc, nil) end
		end
	end
end

local function ensureMapStructureIfNeeded()
	local map = ensurePath("Workspace/Map")
	ensurePath("Workspace/Map/Buildings")
	ensurePath("Workspace/Map/Roads")
	ensurePath("Workspace/Map/Trees")
	ensurePath("Workspace/Map/Props")
	ensurePath("Workspace/Map/Zones")
	ensurePath("Workspace/Interactables")
	ensurePath("Workspace/NPCs")
	ensurePath("Workspace/GeneratedAssets")
	return map
end

local function isWorldBuildAction(a)
	if not a then return false end
	local t = a.type
	if t == "terrainFill" or t == "terrainGenerate" or t == "spawn" or t == "insertAsset" or t == "insert_toolbox_asset" then return true end
	local descriptor = table.concat({ tostring(t or ""), tostring(a.className or ""), tostring(a.name or ""), tostring(a.parent or "") }, " ")
	return pathHas(descriptor, { "workspace", "map", "city", "world", "terrain", "grass", "ground", "road", "building", "tree", "npc", "prop", "zone" })
end

local function getInstanceCenter(inst)
	if not inst or not inst.Parent then return nil end
	if inst:IsA("Model") then
		local ok, pivot = pcall(function() return inst:GetPivot() end)
		if ok and pivot then return pivot.Position end
	elseif inst:IsA("BasePart") then
		return inst.Position
	end
	return nil
end

local function findSpawnLocation()
	for _, desc in ipairs(Workspace:GetDescendants()) do
		if desc:IsA("SpawnLocation") then return desc end
	end
	return nil
end

local function ensurePersistentWorldAfterInsert(createdInstances)
	local map = ensureMapStructureIfNeeded()
	local center = Vector3.new(0, 6, 0)
	for _, inst in ipairs(createdInstances or {}) do
		local pos = getInstanceCenter(inst)
		if pos then center = Vector3.new(pos.X, math.max(pos.Y + 6, 6), pos.Z); break end
	end
	local spawn = findSpawnLocation()
	if not spawn then
		spawn = Instance.new("SpawnLocation")
		spawn.Name = "BloxsmithSpawn"
		spawn.Size = Vector3.new(12, 1, 12)
		spawn.Anchored = true
		spawn.CanCollide = true
		spawn.Neutral = true
		spawn.AllowTeamChangeOnTouch = false
		spawn.Material = Enum.Material.Neon
		spawn.BrickColor = BrickColor.new("Electric blue")
		spawn.Parent = map
	end
	if spawn.Position.Y < 3 then
		spawn.CFrame = CFrame.new(center)
	end
	for _, inst in ipairs(createdInstances or {}) do stabilizeGeneratedInstance(inst) end
	return spawn
end

-- Create or overwrite a script (legacy file sync)
function Actions.script(a)
	normalizePersistentParent(a)
	local parent = resolvePath(a.parent or a.service_location or "ServerScriptService", true)
	if not parent then return false, "bad parent" end
	local className = a.className or a.file_type or "Script"
	local name = a.name or "Script"
	local existing = parent:FindFirstChild(name)
	if existing and not existing:IsA(className) then existing:Destroy(); existing = nil end
	if not existing then
		existing = Instance.new(className); existing.Name = name; existing.Parent = parent
	end
	existing.Source = a.source or a.content or ""
	task.defer(pushSnapshot)
	return true, nil, existing
end

-- Create any Instance (Part, Model, Folder, Sound, ParticleEmitter, etc.)
function Actions.create(a)
	normalizePersistentParent(a)
	local parent = resolvePath(a.parent or "Workspace", true)
	if not parent then return false, "bad parent" end
	local desiredClass = a.className or "Part"
	local desiredName = a.name or desiredClass
	-- If a placeholder (usually an auto-created Folder from resolvePath) already
	-- exists at this name but is the wrong class, replace it with the requested
	-- class and re-parent its existing children so we don't end up with a Folder
	-- masquerading as a ScreenGui / Tool / Model.
	local existing = parent:FindFirstChild(desiredName)
	local inst
	if existing and not existing:IsA(desiredClass) then
		inst = Instance.new(desiredClass)
		inst.Name = desiredName
		for _, child in ipairs(existing:GetChildren()) do
			child.Parent = inst
		end
		existing:Destroy()
	else
		inst = Instance.new(desiredClass)
		inst.Name = desiredName
	end
	applyProps(inst, a.properties)
	applyVisibleDefaults(inst, a.properties)
	inst.Parent = parent
	if a.children then
		for _, c in ipairs(a.children) do
			c.parent = (a.parent or "Workspace") .. "." .. inst.Name
			Actions.create(c)
		end
	end
	return true, nil, inst
end


-- Create a part with helper mapping for size, position, color, material, anchored properties
function Actions.create_part(a)
	normalizePersistentParent(a)
	local parent = resolvePath(a.parent or "Workspace", true)
	if not parent then return false, "bad parent" end
	local part = Instance.new("Part")
	part.Name = a.name or "Part"

	if a.size then
		part.Size = toVector3(a.size, Vector3.new(4,4,4))
	end
	if a.position then
		part.Position = toVector3(a.position, Vector3.new(0,5,0))
	end
	if a.color then
		part.Color = toColor3(a.color, Color3.fromRGB(200,200,200))
	end
	if a.material then
		pcall(function() part.Material = Enum.Material[a.material] or Enum.Material.SmoothPlastic end)
	end
	if a.anchored ~= nil then
		part.Anchored = a.anchored
	else
		part.Anchored = true
	end
	part.CanCollide = true
	part.Transparency = 0

	applyProps(part, a.properties)
	-- Final visibility safety net (size/position) without overriding explicit input.
	local hasPos = (a.position ~= nil) or (a.properties and (a.properties.Position or a.properties.CFrame))
	if not hasPos and part.Position.Magnitude < 0.01 then
		part.CFrame = CFrame.new(0, 10, 0)
	end
	part.Parent = parent
	return true, nil, part
end

-- Update an existing instance's properties. If missing, optionally auto-create.
function Actions.set(a)
	local inst = resolvePath(a.path, false)
	if not inst then
		-- Auto-create if AI provided a className (e.g. wants a Part at this path)
		if a.className and typeof(a.path) == "string" then
			local parts = string.split(string.gsub(a.path, "/", "."), ".")
			local leaf = table.remove(parts)
			local parentPath = table.concat(parts, ".")
			local parent = resolvePath(parentPath, true)
			if parent then
				local ok, created = pcall(function()
					local c = Instance.new(a.className)
					c.Name = leaf
					c.Parent = parent
					return c
				end)
				if ok and created then
					applyProps(created, a.properties)
					return true
				end
			end
		end
		-- Soft-skip so a missing target (e.g. Workspace.Baseplate on empty places) doesn't fail the whole batch
		return true, "skipped (path not found): " .. tostring(a.path)
	end
	applyProps(inst, a.properties)
	return true
end

-- Delete an instance
function Actions.delete(a)
	local inst = resolvePath(a.path, false)
	if not inst then return true, "skipped (path not found): " .. tostring(a.path) end
	if a.confirmed ~= true and a.force ~= true then
		local decided = false
		local approved = false
		task.spawn(function()
			showDeleteConfirmDialog(a.path or instancePath(inst), function(choice)
				approved = choice
				decided = true
			end)
		end)
		while not decided do task.wait(0.1) end
		if not approved then return false, "delete cancelled by user" end
	end
	inst:Destroy()
	return true
end

instancePath = function(inst)
	local parts = {}
	local cur = inst
	while cur and cur ~= game do
		table.insert(parts, 1, cur.Name)
		cur = cur.Parent
	end
	return "game." .. table.concat(parts, ".")
end

local function instanceId(inst)
	local ok, id = pcall(function() return inst:GetDebugId(0) end)
	if ok and id then return id end
	return instancePath(inst)
end

-- Move an existing instance into a Folder/Model/service, creating folders as needed.
function Actions.move(a)
	local inst = resolvePath(a.path, false)
	if not inst then return true, "skipped (path not found): " .. tostring(a.path) end
	local parent = resolvePath(a.newParent or a.parent or "Workspace", true)
	if not parent then return false, "bad newParent" end
	inst.Parent = parent
	task.defer(pushSnapshot)
	return true
end

-- Rename an existing instance.
function Actions.rename(a)
	local inst = resolvePath(a.path, false)
	if not inst then return true, "skipped (path not found): " .. tostring(a.path) end
	local newName = a.newName or a.name
	if not newName or tostring(newName) == "" then return false, "missing newName" end
	inst.Name = tostring(newName)
	task.defer(pushSnapshot)
	return true
end


-- Create a Folder/Model and bulk-move listed instances into it.
function Actions.organize(a)
	local parent = resolvePath(a.parent or "Workspace", true)
	if not parent then return false, "bad parent" end
	local containerClass = a.container or a.className or "Folder"
	if containerClass ~= "Folder" and containerClass ~= "Model" then containerClass = "Folder" end
	local name = a.name or a.folderName or "OrganizedFolder"
	local container = parent:FindFirstChild(name)
	if container and not container:IsA(containerClass) then
		return false, "existing container has wrong class: " .. tostring(name)
	end
	if not container then
		container = Instance.new(containerClass)
		container.Name = name
		container.Parent = parent
	end
	for _, path in ipairs(a.items or a.objects or {}) do
		local inst = resolvePath(path, false)
		if inst and inst ~= container and not container:IsAncestorOf(inst) then
			inst.Parent = container
		end
	end
	task.defer(pushSnapshot)
	return true
end

-- Set service-level properties (Lighting, Workspace gravity, etc.)
function Actions.service(a)
	local svc = getService(a.service)
	if not svc then return false, "no service" end
	applyProps(svc, a.properties)
	return true
end

-- Terrain: fill a region with a material
function Actions.terrainFill(a)
	local rawMat = a.material
	local matName
	if type(rawMat) == "table" then
		matName = rawMat.value or rawMat.name or "Grass"
	elseif type(rawMat) == "string" then
		matName = rawMat
	else
		matName = "Grass"
	end
	local mat = Enum.Material[matName] or Enum.Material.Grass
	local cf  = coerceValue(a.cframe or { __t="CFrame", x=0, y=0, z=0 })
	local size = coerceValue(a.size or { __t="Vector3", x=512, y=8, z=512 })
	Terrain:FillBlock(cf, size, mat)
	return true
end

-- Terrain: clear everything
function Actions.terrainClear()
	Terrain:Clear()
	return true
end

-- Generate a procedural terrain region (used for "build me an island/forest" prompts)
function Actions.terrainGenerate(a)
	local size = coerceValue(a.size or { __t="Vector3", x=1024, y=256, z=1024 })
	local origin = coerceValue(a.origin or { __t="Vector3", x=0, y=0, z=0 })
	local biome = a.biome or "Plains"
	local biomeEnum = Enum.Biome[biome] or Enum.Biome.Plains
	local region = Region3.new(origin - size/2, origin + size/2):ExpandToGrid(4)
	Terrain:GenerateAsync(region, a.seed or math.random(1, 1e9), { biomeEnum })
	return true
end

-- Lighting preset
function Actions.lighting(a)
	applyProps(Lighting, a.properties or {})
	return true
end

-- Spawn point helper
function Actions.spawn(a)
	ensureMapStructureIfNeeded()
	local pos = coerceValue(a.position or { __t="Vector3", x=0, y=10, z=0 })
	if typeof(pos) == "Vector3" and pos.Y < 4 then pos = Vector3.new(pos.X, 6, pos.Z) end
	local parent = resolvePath(a.parent or "Workspace/Map", true) or Workspace
	local sp = Instance.new("SpawnLocation")
	sp.Anchored = true; sp.CanCollide = true
	sp.Size = Vector3.new(12, 1, 12)
	sp.CFrame = CFrame.new(pos)
	sp.TopSurface = Enum.SurfaceType.Smooth
	sp.Material = Enum.Material.Neon
	sp.BrickColor = BrickColor.new("Electric blue")
	sp.Name = a.name or "SpawnLocation"
	sp.Neutral = true
	sp.AllowTeamChangeOnTouch = false
	sp.Parent = parent
	return true, nil, sp
end

-- Select an instance in Studio (so the user sees what AI just built)
function Actions.select(a)
	local inst = resolvePath(a.path, false)
	if inst then Selection:Set({ inst }) end
	return true
end

-- Try multiple ways to load an asset by ID. Returns (containerModel, errorString).
-- 1) InsertService:LoadAsset (needs asset to be owned/public to the game creator)
-- 2) game:GetObjects("rbxassetid://ID") (plugin-only, works for any asset the logged-in Studio user can access — including most toolbox models)
local function tryLoadAssetById(assetId)
	local InsertService = game:GetService("InsertService")
	local ok, modelOrErr = pcall(function() return InsertService:LoadAsset(assetId) end)
	if ok and modelOrErr then return modelOrErr, nil end
	local firstErr = tostring(modelOrErr)
	local ok2, objs = pcall(function() return game:GetObjects("rbxassetid://" .. tostring(assetId)) end)
	if ok2 and objs and #objs > 0 then
		local wrapper = Instance.new("Model")
		for _, o in ipairs(objs) do o.Parent = wrapper end
		return wrapper, nil
	end
	local hint = ""
	if firstErr:find("not authorized") or firstErr:find("Authorized") then
		hint = " (asset is private or not owned by the game creator — try a public/free model, or take the model into your inventory first)"
	end
	return nil, "LoadAsset failed: " .. firstErr .. hint
end

-- Insert a Roblox free model / mesh / decal / animation from the toolbox by assetId.
function Actions.insertAsset(a)
	normalizePersistentParent(a)
	local parent = resolvePath(a.parent or "Workspace", true)
	if not parent then return false, "bad parent" end
	local assetId = tonumber(a.assetId)
	if not assetId then return false, "missing assetId" end
	local model, err = tryLoadAssetById(assetId)
	if not model then return false, err end
	local moved = {}
	local children = model:GetChildren()
	local targetParent = parent
	if a.name and #children > 1 then
		targetParent = Instance.new("Model")
		targetParent.Name = a.name
		targetParent.Parent = parent
	end
	for _, child in ipairs(children) do
		if a.name and #model:GetChildren() == 1 then child.Name = a.name end
		child.Parent = targetParent
		stabilizeGeneratedInstance(child)
		table.insert(moved, child)
	end
	model:Destroy()
	local placed = (typeof(targetParent) == "Instance" and targetParent ~= parent) and targetParent or moved[1]
	if a.position and placed and placed:IsA("Model") then
		local pos = asVector3(a.position)
		placed:PivotTo(CFrame.new(pos))
	elseif a.position and placed and placed:IsA("BasePart") then
		placed.CFrame = CFrame.new(asVector3(a.position))
	end
	if placed then stabilizeGeneratedInstance(placed) end
	return true, nil, placed
end

-- Insert a safe free toolbox model by ID with safety scan & consent flow
function Actions.insert_toolbox_asset(a)
	normalizePersistentParent(a)
	local parent = resolvePath(a.parent or "Workspace", true)
	if not parent then return false, "bad parent" end
	local assetId = tonumber(a.assetId)
	if not assetId then return false, "missing assetId" end
	
	local model, err = tryLoadAssetById(assetId)
	if not model then return false, err end
	
	-- Asset Safety Scanner: collect scripts + classify suspicion
	local scriptsFound = {}
	local suspiciousReasons = {}
	local SUSPICION_PATTERNS = {
		{ pat = "require%s*%(%s*%d+%s*%)",    reason = "require(<assetId>) backdoor" },
		{ pat = "getfenv%s*%(",               reason = "getfenv / sandbox escape" },
		{ pat = "setfenv%s*%(",               reason = "setfenv / sandbox escape" },
		{ pat = "loadstring%s*%(",            reason = "loadstring (dynamic code)" },
		{ pat = "HttpService",                reason = "HttpService (external network)" },
		{ pat = "MarketplaceService:Prompt",  reason = "unsolicited purchase prompt" },
		{ pat = "TeleportService",            reason = "teleport script" },
		{ pat = "BindToClose",                reason = "shutdown hook (BindToClose)" },
		{ pat = "Players%[",                  reason = "player-targeting code" },
		{ pat = "_G%[",                       reason = "global table abuse (_G[...])" },
		{ pat = "shared%[",                   reason = "shared table abuse" },
		{ pat = "\\%d%d%d",                   reason = "obfuscated string escapes" },
	}
	local function scanSource(src)
		if type(src) ~= "string" or src == "" then return nil end
		local longestLine = 0
		for line in src:gmatch("[^\r\n]+") do
			if #line > longestLine then longestLine = #line end
		end
		local hits = {}
		if longestLine > 600 then table.insert(hits, "obfuscated (huge single line)") end
		for _, p in ipairs(SUSPICION_PATTERNS) do
			if src:find(p.pat) then table.insert(hits, p.reason) end
		end
		if #hits == 0 then return nil end
		return table.concat(hits, ", ")
	end
	for _, desc in ipairs(model:GetDescendants()) do
		if desc:IsA("LuaSourceContainer") then
			table.insert(scriptsFound, desc)
			local src = ""
			pcall(function() src = desc.Source or "" end)
			local why = scanSource(src)
			if why then
				table.insert(suspiciousReasons, desc:GetFullName() .. " — " .. why)
			end
		end
	end
	local hasSuspicious = #suspiciousReasons > 0

	local decision = "keep"
	
	if #scriptsFound > 0 then
		if a.removeScriptsFromDecorativeAssets == true
			or (a.removeUnsafeScripts == true and (hasSuspicious or not a.requiresApprovalIfScriptsFound)) then
			decision = "remove"
		else
			local responseReceived = false
			local userChoice = nil
			
			task.spawn(function()
				showScriptPromptDialog(model.Name, #scriptsFound, function(choice)
					userChoice = choice
					responseReceived = true
				end)
			end)
			
			while not responseReceived do
				task.wait(0.1)
			end
			
			decision = userChoice
		end
	end

	if decision == "cancel" then
		model:Destroy()
		return false, "User cancelled insertion due to unsafe scripts"
	end

	if decision == "remove" then
		for _, scr in ipairs(scriptsFound) do
			pcall(function() scr:Destroy() end)
		end
	end

	local moved = {}
	local children = model:GetChildren()
	local targetParent = parent
	if a.name and #children > 1 then
		targetParent = Instance.new("Model")
		targetParent.Name = a.name
		targetParent.Parent = parent
	end
	for _, child in ipairs(children) do
		if a.name and #model:GetChildren() == 1 then child.Name = a.name end
		child.Parent = targetParent
		stabilizeGeneratedInstance(child)
		table.insert(moved, child)
	end
	model:Destroy()

	local placed = (typeof(targetParent) == "Instance" and targetParent ~= parent) and targetParent or moved[1]
	if a.position and placed then
		local pos = asVector3(a.position)
		if placed:IsA("Model") then
			placed:PivotTo(CFrame.new(pos))
		elseif placed:IsA("BasePart") then
			placed.CFrame = CFrame.new(pos)
		end
	end

	task.defer(pushSnapshot)
	if placed then stabilizeGeneratedInstance(placed) end
	return true, nil, placed
end

-- Update source code of an existing script
function Actions.update_script(a)
	local path = a.path or a.file_path
	if not path then return false, "missing path" end
	local inst = resolvePath(path, false)
	if not inst then return false, "script not found: " .. tostring(path) end
	if not inst:IsA("LuaSourceContainer") then return false, "target is not a script" end
	inst.Source = a.source or a.content or ""
	task.defer(pushSnapshot)
	return true
end

-- Delete a script (web workspace delete reflects into Studio)
function Actions.delete_script(a)
	local path = a.path or a.file_path
	if not path then return false, "missing path" end
	local inst = resolvePath(path, false)
	if not inst then return true end -- already gone, treat as success
	pcall(function() inst:Destroy() end)
	task.defer(pushSnapshot)
	return true
end

-- Scan the project and push the snapshot
function Actions.scan_project()
	task.defer(pushSnapshot)
	return true
end

function Actions.cancel_scan()
	scanCancelRequested = true
	appendLog("Scan cancel requested")
	return true
end

-- Apply a Roblox image assetId as a Decal on a target Part.
function Actions.decal(a)
	local target = resolvePath(a.path, false)
	if not target then return false, "decal target not found" end
	if not target:IsA("BasePart") then return false, "decal target not a BasePart" end
	local face = (a.face and Enum.NormalId[a.face]) or Enum.NormalId.Front
	local decal = target:FindFirstChild(a.name or "Decal")
	if not decal or not decal:IsA("Decal") then
		decal = Instance.new("Decal")
		decal.Name = a.name or "Decal"
		decal.Parent = target
	end
	decal.Face = face
	decal.Texture = "rbxassetid://" .. tostring(a.assetId)
	return true
end

-- Insert a Sound under a parent with a Roblox audio assetId.
function Actions.sound(a)
	local parent = resolvePath(a.parent or "Workspace", true)
	if not parent then return false, "bad parent" end
	local s = parent:FindFirstChild(a.name or "Sound")
	if not s or not s:IsA("Sound") then
		s = Instance.new("Sound")
		s.Name = a.name or "Sound"
		s.Parent = parent
	end
	s.SoundId = "rbxassetid://" .. tostring(a.assetId)
	s.Volume = a.volume or 0.5
	s.Looped = a.looped == true
	s.PlaybackSpeed = a.playbackSpeed or 1
	if a.play then pcall(function() s:Play() end) end
	return true
end

-- Set the Image property on an ImageLabel/ImageButton/Decal/Texture by path.
function Actions.image(a)
	local inst = resolvePath(a.path, false)
	if not inst then return false, "image target not found" end
	local uri = "rbxassetid://" .. tostring(a.assetId)
	if inst:IsA("ImageLabel") or inst:IsA("ImageButton") then
		inst.Image = uri
	elseif inst:IsA("Decal") or inst:IsA("Texture") then
		inst.Texture = uri
	else
		return false, "instance does not accept an image"
	end
	return true
end

----------------------------------------------------------------
-- Workspace context reporter — gives the AI full awareness
----------------------------------------------------------------
local MAX_INSTANCES = 800
local MAX_DEPTH     = 6

local function snapshotInstance(inst, depth)
	local node = {
		id = instanceId(inst),
		name = inst.Name,
		className = inst.ClassName,
		path = instancePath(inst),
		parentPath = inst.Parent and instancePath(inst.Parent) or nil,
	}
	if inst:IsA("BasePart") then
		node.size = { x = inst.Size.X, y = inst.Size.Y, z = inst.Size.Z }
		node.position = { x = inst.Position.X, y = inst.Position.Y, z = inst.Position.Z }
		node.material = inst.Material.Name
		node.color = { r = math.floor(inst.Color.R*255), g = math.floor(inst.Color.G*255), b = math.floor(inst.Color.B*255) }
		node.anchored = inst.Anchored
		if inst:IsA("MeshPart") then
			node.assetId = inst.MeshId
			node.textureId = inst.TextureID
		end
	elseif inst:IsA("LuaSourceContainer") then
		local src = inst.Source or ""
		node.sourcePreview = string.sub(src, 1, 4000)
		node.sourceLength  = #src
	elseif inst:IsA("Decal") or inst:IsA("Texture") then
		node.assetId = inst.Texture
	elseif inst:IsA("Sound") then
		node.assetId = inst.SoundId
	elseif inst:IsA("Animation") then
		node.assetId = inst.AnimationId
	end
	return node
end

local function snapshotChildren(parent, depth, counter)
	local out = {}
	if depth > MAX_DEPTH then return out end
	for _, child in ipairs(parent:GetChildren()) do
		if counter[1] >= MAX_INSTANCES then break end
		counter[1] = counter[1] + 1
		local node = snapshotInstance(child, depth)
		local kids = snapshotChildren(child, depth + 1, counter)
		if #kids > 0 then node.children = kids end
		table.insert(out, node)
	end
	return out
end

local function buildContext()
	local counter = { 0 }
	local roots = {}
	for _, svcName in ipairs({
		"Workspace","ServerScriptService","ServerStorage","ReplicatedStorage",
		"StarterPlayer","StarterPlayerScripts","StarterCharacterScripts",
		"StarterGui","StarterPack","Lighting","SoundService","Teams",
	}) do
		local svc = getService(svcName)
		if svc then
			local rootNode = snapshotInstance(svc, 0)
			rootNode.name = svcName
			rootNode.children = snapshotChildren(svc, 1, counter)
			table.insert(roots, {
				id = rootNode.id,
				name = rootNode.name,
				className = rootNode.className,
				path = rootNode.path,
				parentPath = rootNode.parentPath,
				children = rootNode.children,
			})
		end
	end
	return {
		projectName = game.Name,
		placeId  = game.PlaceId,
		scannedAt = os.date("!%Y-%m-%dT%H:%M:%SZ"),
		placeName= game.Name,
		gravity  = Workspace.Gravity,
		lighting = {
			ambient        = tostring(Lighting.Ambient),
			clockTime      = Lighting.ClockTime,
			fogEnd         = Lighting.FogEnd,
			environmentDiffuseScale = Lighting.EnvironmentDiffuseScale,
		},
		instanceCount = counter[1],
		truncated     = counter[1] >= MAX_INSTANCES,
		tree          = roots,
	}
end

function showScriptPromptDialog(assetName, scriptCount, callback)
	pcall(function() widget.Enabled = true end)
	local overlay = Instance.new("Frame", widget)
	overlay.Size = UDim2.fromScale(1,1)
	overlay.BackgroundColor3 = Color3.new(0,0,0)
	overlay.BackgroundTransparency = 0.4
	overlay.BorderSizePixel = 0
	overlay.ZIndex = 100

	local box = Instance.new("Frame", overlay)
	box.Size = UDim2.new(1,-24,0,180)
	box.Position = UDim2.new(0,12,0.5,-90)
	box.BackgroundColor3 = C.panel
	box.BorderSizePixel = 0
	box.ZIndex = 101
	corner(box, 10); stroke(box, C.stroke, 1); padAll(box, 14)

	local boxList = Instance.new("UIListLayout", box)
	boxList.Padding = UDim.new(0,10); boxList.SortOrder = Enum.SortOrder.LayoutOrder

	local h = Instance.new("TextLabel", box)
	h.LayoutOrder = 1; h.BackgroundTransparency = 1
	h.Size = UDim2.new(1,0,0,20)
	h.Font = Enum.Font.GothamBold; h.TextSize = 13
	h.TextColor3 = C.text; h.Text = "Security Warning"
	h.TextXAlignment = Enum.TextXAlignment.Left; h.ZIndex = 102

	local body = Instance.new("TextLabel", box)
	body.LayoutOrder = 2; body.BackgroundTransparency = 1
	body.Size = UDim2.new(1,0,0,50)
	body.Font = Enum.Font.Gotham; body.TextSize = 11
	body.TextColor3 = C.textDim; body.TextWrapped = true
	body.TextXAlignment = Enum.TextXAlignment.Left
	body.TextYAlignment = Enum.TextYAlignment.Top
	body.ZIndex = 102
	body.Text = ("The model '%s' contains %d script(s). Free models from the Toolbox can contain malicious code. How would you like to proceed?"):format(assetName, scriptCount)

	local btnRow = Instance.new("Frame", box)
	btnRow.LayoutOrder = 3; btnRow.BackgroundTransparency = 1
	btnRow.Size = UDim2.new(1,0,0,32); btnRow.ZIndex = 102

	local btnList = Instance.new("UIListLayout", btnRow)
	btnList.FillDirection = Enum.FillDirection.Horizontal
	btnList.Padding = UDim.new(0,6)

	local function makeBtn(name, bg, col, widthScale)
		local b = Instance.new("TextButton", btnRow)
		b.Size = UDim2.new(widthScale, -4, 1, 0)
		b.BackgroundColor3 = bg; b.TextColor3 = col
		b.Font = Enum.Font.GothamMedium; b.TextSize = 11
		b.Text = name; b.BorderSizePixel = 0; b.ZIndex = 102
		corner(b, 6)
		return b
	end

	local btnKeep = makeBtn("Keep Scripts", C.accent, Color3.new(1,1,1), 0.33)
	local btnStrip = makeBtn("Remove Scripts", C.primary, Color3.new(1,1,1), 0.33)
	local btnCancel = makeBtn("Cancel", C.disconnect, C.text, 0.33)

	btnKeep.MouseButton1Click:Connect(function()
		overlay:Destroy()
		callback("keep")
	end)

	btnStrip.MouseButton1Click:Connect(function()
		overlay:Destroy()
		callback("remove")
	end)

	btnCancel.MouseButton1Click:Connect(function()
		overlay:Destroy()
		callback("cancel")
	end)
end

local function computeHash(str)
	local hash = 5381
	for i = 1, #str do
		hash = ((hash * 33) + string.byte(str, i)) % 2147483648
	end
	return string.format("%08x", hash)
end

local function getInstanceProperties(inst)
	local props = {}
	if inst:IsA("BasePart") then
		props.position = { inst.Position.X, inst.Position.Y, inst.Position.Z }
		props.size = { inst.Size.X, inst.Size.Y, inst.Size.Z }
		props.color = { math.floor(inst.Color.R * 255), math.floor(inst.Color.G * 255), math.floor(inst.Color.B * 255) }
		props.material = inst.Material.Name
		props.anchored = inst.Anchored
	elseif inst:IsA("Light") then
		props.color = { math.floor(inst.Color.R * 255), math.floor(inst.Color.G * 255), math.floor(inst.Color.B * 255) }
		props.brightness = inst.Brightness
		props.range = inst.Range
		props.enabled = inst.Enabled
	elseif inst:IsA("Decal") or inst:IsA("Texture") then
		props.texture = inst.Texture
	elseif inst:IsA("Sound") then
		props.soundId = inst.SoundId
		props.volume = inst.Volume
		props.playbackSpeed = inst.PlaybackSpeed
		props.looped = inst.Looped
	elseif inst:IsA("GuiObject") then
		props.size = { inst.Size.X.Scale, inst.Size.X.Offset, inst.Size.Y.Scale, inst.Size.Y.Offset }
		props.position = { inst.Position.X.Scale, inst.Position.X.Offset, inst.Position.Y.Scale, inst.Position.Y.Offset }
		props.backgroundColor = { math.floor(inst.BackgroundColor3.R * 255), math.floor(inst.BackgroundColor3.G * 255), math.floor(inst.BackgroundColor3.B * 255) }
		props.visible = inst.Visible
		if inst:IsA("TextLabel") or inst:IsA("TextButton") or inst:IsA("TextBox") then
			props.text = inst.Text
		end
	end
	return props
end

local function scanProject(timeoutSeconds)
	local scanServices = {
		"Workspace",
		"ServerScriptService",
		"ServerStorage",
		"ReplicatedStorage",
		"ReplicatedFirst",
		"StarterGui",
		"StarterPack",
		"StarterPlayer",
		"StarterPlayerScripts",
		"StarterCharacterScripts",
		"SoundService",
		"Lighting",
		"Teams",
	}

	local files = {}
	local deadline = os.clock() + (timeoutSeconds or SCAN_TIMEOUT_SECONDS)
	local scanned = 0
	local timedOut = false
	local cancelled = false

	local function shouldStop()
		if scanCancelRequested then
			cancelled = true
			return true
		end
		if os.clock() > deadline then
			timedOut = true
			return true
		end
		return false
	end

	local function traverse(inst, parentPath)
		if shouldStop() then return end
		scanned += 1
		local currentPath = parentPath == "" and inst.Name or (parentPath .. "/" .. inst.Name)
		-- Honor ignore filters: skip this subtree entirely.
		if pathIsIgnored(currentPath) then return end
		local isScript = inst:IsA("LuaSourceContainer")
		local includeObj = false
		
		if isScript or inst:IsA("Folder") or inst:IsA("Model") or inst:IsA("BasePart") or inst:IsA("Light") or inst:IsA("Decal") or inst:IsA("Texture") or inst:IsA("Sound") or inst:IsA("Animation") or inst:IsA("Tool") or inst:IsA("GuiBase") or inst:IsA("GuiObject") or inst:IsA("RemoteEvent") or inst:IsA("RemoteFunction") or inst:IsA("BindableEvent") or inst:IsA("BindableFunction") or inst:IsA("Team") or inst:IsA("SpawnLocation") or inst:IsA("Lighting") or inst:IsA("Teams") then
			includeObj = true
		end

		if includeObj then
			local fileNode = {
				id = instanceId(inst),
				name = inst.Name,
				className = inst.ClassName,
				path = currentPath,
				parent = parentPath ~= "" and string.split(parentPath, "/")[1] or inst.Parent.Name,
				parentPath = parentPath,
				studioPath = instancePath(inst),
			}
			if isScript then
				fileNode.source = inst.Source or ""
				fileNode.hash = computeHash(fileNode.source)
			else
				fileNode.properties = getInstanceProperties(inst)
			end
			table.insert(files, fileNode)
		end

		for _, child in ipairs(inst:GetChildren()) do
			traverse(child, currentPath)
			if timedOut or cancelled then break end
		end
	end

	for _, svcName in ipairs(scanServices) do
		if shouldStop() then break end
		if not pathIsIgnored(svcName) then
			local svc = getService(svcName)
			if svc then
				for _, child in ipairs(svc:GetChildren()) do
					traverse(child, svcName)
					if timedOut or cancelled then break end
				end
			end
		end
	end

	return files, {
		count = scanned,
		timedOut = timedOut,
		cancelled = cancelled,
	}
end

function pushSnapshot()
	if not activeProjectId then return end
	if getClearMode() then
		syncInfo.Text = "Clear Mode — snapshot skipped"
		return
	end
	if scanInProgress then
		syncInfo.Text = "Scan already running"
		return
	end
	scanInProgress = true
	scanCancelRequested = false
	setPill("scanning")
	status.Text = "Scanning project..."
	syncInfo.Text = "Scanning Studio project..."
	appendLog("Project scan started")
	local started = os.clock()
	local files, scan = scanProject(SCAN_TIMEOUT_SECONDS)
	if scan.cancelled then
		scanInProgress = false
		status.Text = "Connected"
		syncInfo.Text = "Scan cancelled"
		setPill("connected")
		appendLog("Project scan cancelled")
		return
	end
	if scan.timedOut then
		scanInProgress = false
		status.Text = "Connected"
		syncInfo.Text = ("Scan timed out at %d object(s)"):format(scan.count)
		setPill("error")
		appendLog("Project scan timed out")
		return
	end
	local data, err = postJSON("/api/studio/snapshot", {
		projectId = activeProjectId,
		files = files,
	})
	scanInProgress = false
	if err then
		status.Text = "Connected"
		syncInfo.Text = "Snapshot error: " .. tostring(err)
		setPill("error")
		appendLog("Snapshot push error: " .. tostring(err))
	else
		status.Text = "Connected"
		syncInfo.Text = ("Loaded %d object(s) in %.1fs"):format(#files, os.clock() - started)
		setPill("connected")
		lastContextSentAt = 0
		appendLog("Project scan finished: " .. tostring(#files) .. " object(s)")
	end
end

----------------------------------------------------------------
-- Sync engine
----------------------------------------------------------------
local function fingerprintActions(actions)
	local s = ""
	for _, a in ipairs(actions or {}) do
		s ..= (a.id or a.type or "") .. ":" .. tostring(a.rev or "") .. ";"
	end
	return s
end

-- Returns true if this action targets (or would create things inside) any
-- path the user has marked as ignored. Covers organize / move / rename /
-- clean / script / create / etc. since they all reference a path-like field.
local function actionTouchesIgnored(action)
	if not action then return false end
	local candidates = {
		action.path, action.target, action.newParent, action.parent,
		action.destination, action.dest, action.folder, action.container,
	}
	for _, p in ipairs(candidates) do
		if type(p) == "string" and pathIsIgnored(p) then return true end
	end
	local items = action.items or action.objects or action.paths
	if type(items) == "table" then
		for _, p in ipairs(items) do
			if type(p) == "string" and pathIsIgnored(p) then return true end
		end
	end
	return false
end

local function dispatch(action)
	normalizePersistentParent(action)
	local fn = Actions[action.type]
	if not fn then return false, "unknown action: " .. tostring(action.type) end
	if actionTouchesIgnored(action) then
		appendLog("Skipped " .. tostring(action.type) .. " — matches ignore filter")
		statsSkipped = statsSkipped + 1
		pcall(refreshStatsInfo)
		return true
	end
	return fn(action)
end

-- ============================================================
-- Preview mode queue + apply pipeline
-- ============================================================
local pendingPreview = {}        -- queued actions awaiting user approval
local previewSeenIds = {}        -- de-dup so the same action isn't re-queued

local function refreshReviewBtnLabel()
	reviewBtn.Text = ("Review Pending (%d)"):format(#pendingPreview)
end
refreshReviewBtnLabel()

-- Focus the Studio camera on a freshly created instance so the user immediately
-- sees what BloxSmith inserted (only for visible BaseParts / Models).
local function focusOn(instances)
	if not instances or #instances == 0 then return end
	pcall(function() Selection:Set(instances) end)
	local target
	for _, inst in ipairs(instances) do
		if inst and inst.Parent then
			if inst:IsA("Model") or inst:IsA("BasePart") then target = inst; break end
		end
	end
	if not target then return end
	pcall(function()
		local cam = Workspace.CurrentCamera
		if not cam then return end
		local cf
		if target:IsA("Model") then
			local ok, pivot = pcall(function() return target:GetPivot() end)
			if ok then cf = pivot end
		else
			cf = target.CFrame
		end
		if cf then
			cam.CFrame = CFrame.new(cf.Position + Vector3.new(20, 15, 20), cf.Position)
		end
	end)
end

-- Runs the actual Studio mutations + reports status back to the website.
-- Used by both immediate sync and "Apply" inside the preview overlay.
local function applyActions(actions, sourceLabel)
	if #actions == 0 then return end

	if not RunService:IsEdit() then
		syncInfo.Text = "Play mode detected — stop Play to save BloxSmith changes permanently."
		setPill("error")
		warn("[BloxSmith] Play mode changes may not save. Stop Play mode so I can insert generated content into persistent Studio services.")
		local reports = {}
		for _, a in ipairs(actions) do
			if a.id then
				table.insert(reports, {
					id = a.id, status = "failed",
					error = "Stop Play mode first so I can apply this permanently in Studio edit mode.",
				})
			end
		end
		if #reports > 0 then
			pcall(function() postJSON("/report", { reports = reports }) end)
		end
		statsErrors = statsErrors + #actions
		pcall(refreshStatsInfo)
		return 0, #actions, {}
	end

	setPill("executing")
	local recordingId = nil
	if ChangeHistoryService.TryBeginRecording then
		recordingId = ChangeHistoryService:TryBeginRecording(
			"BloxSmith " .. (sourceLabel or "build"),
			"BloxSmith AI generation"
		)
	else
		ChangeHistoryService:SetWaypoint("BloxSmith pre-build")
	end

	local ok, fail = 0, 0
	local touchedWorld = false
	local reports = {}
	local failedDetails = {}
	local createdInstances = {}
	for _, a in ipairs(actions) do
		if isWorldBuildAction(a) then touchedWorld = true end
		local pcOk, success, errOrInst, instMaybe = pcall(dispatch, a)
		local executed = pcOk and success and success ~= false
		local createdInst = nil
		local errMsg = nil
		if executed then
			-- dispatch returns (true, nil, instance) for create-style actions
			if typeof(errOrInst) == "Instance" then createdInst = errOrInst
			elseif typeof(instMaybe) == "Instance" then createdInst = instMaybe end
		else
			if pcOk then
				errMsg = tostring(errOrInst or "failed")
			else
				errMsg = tostring(success or "error")
			end
		end
		if executed then
			ok = ok + 1
			if createdInst then table.insert(createdInstances, createdInst) end
			if a.id then
				local report = { id = a.id, status = "executed" }
				if createdInst then
					report.path = instancePath(createdInst)
					report.className = createdInst.ClassName
					report.name = createdInst.Name
				end
				table.insert(reports, report)
			end
		else
			fail = fail + 1
			table.insert(failedDetails, { action = a, error = errMsg })
			if a.id then table.insert(reports, { id = a.id, status = "failed", error = errMsg }) end
			pcall(function()
				postJSON("/errors", { errors = {{
					projectId = activeProjectId,
					action_type = a.type,
					action_id   = a.id,
					error_message = errMsg,
				}}})
			end)
		end
	end

	if #reports > 0 then
		pcall(function() postJSON("/report", { reports = reports }) end)
	end

	if recordingId then
		pcall(function() ChangeHistoryService:FinishRecording(recordingId, Enum.FinishRecordingOperation.Commit) end)
	else
		ChangeHistoryService:SetWaypoint(("BloxSmith built %d (%d failed)"):format(ok, fail))
	end

	-- Select + camera-focus the freshly created objects so the user
	-- can SEE the result in Studio edit mode immediately.
	if #createdInstances > 0 then
		pcall(focusOn, createdInstances)
	end

	if touchedWorld then
		local spawn = ensurePersistentWorldAfterInsert(createdInstances)
		appendLog("Inserted generated world content into persistent Workspace folders; SpawnLocation verified for Play mode.")
		if spawn then table.insert(createdInstances, spawn) end
	end

	if fail > 0 then setPill("error") else setPill("complete") end
	appendLog(("Command executed: %d ok, %d failed"):format(ok, fail))

	-- Bump session counters for the STATS row.
	statsApplied = statsApplied + ok
	statsErrors  = statsErrors  + fail
	pcall(refreshStatsInfo)

	task.defer(pushSnapshot)
	task.delay(3, function()
		if connected then setPill("connected") end
	end)

	local statusPrefix = touchedWorld and "Inserted into Workspace/Map — edit + play ready" or "Built"
	syncInfo.Text = ("[%s] %s %d action(s)%s · %s · undoable"):format(
		activeProjectName or "project", statusPrefix, ok, (fail > 0 and (" · " .. fail .. " failed") or ""), os.date("%H:%M:%S"))

	return ok, fail, failedDetails
end

-- Tells the website "these actions were rejected" so the build status doesn't
-- hang forever in the dashboard.
local function reportDiscarded(actions)
	local reports = {}
	for _, a in ipairs(actions) do
		if a.id then
			table.insert(reports, { id = a.id, status = "failed", error = "Discarded in Preview Mode" })
		end
	end
	if #reports > 0 then
		pcall(function() postJSON("/report", { reports = reports }) end)
	end
end

-- ============================================================
-- Preview overlay — lists each queued action and lets the user
-- Apply All / Discard All without ever entering Play mode.
-- ============================================================
local previewOverlay = nil
local function closePreviewOverlay()
	if previewOverlay then
		previewOverlay:Destroy()
		previewOverlay = nil
	end
end

local function openPreviewOverlay()
	closePreviewOverlay()
	if #pendingPreview == 0 then
		syncInfo.Text = "Nothing pending. Ask the AI to build something first."
		return
	end

	previewOverlay = Instance.new("Frame", widget)
	previewOverlay.Size = UDim2.fromScale(1, 1)
	previewOverlay.BackgroundColor3 = Color3.new(0, 0, 0)
	previewOverlay.BackgroundTransparency = 0.25
	previewOverlay.BorderSizePixel = 0
	previewOverlay.ZIndex = 60

	local box = Instance.new("Frame", previewOverlay)
	box.Size = UDim2.new(1, -24, 1, -24)
	box.Position = UDim2.new(0, 12, 0, 12)
	box.BackgroundColor3 = C.panel
	box.BorderSizePixel = 0
	box.ZIndex = 61
	corner(box, 10)
	stroke(box, C.stroke, 1)

	local pad = Instance.new("UIPadding", box)
	pad.PaddingTop = UDim.new(0, 12)
	pad.PaddingBottom = UDim.new(0, 12)
	pad.PaddingLeft = UDim.new(0, 12)
	pad.PaddingRight = UDim.new(0, 12)

	local title = Instance.new("TextLabel", box)
	title.BackgroundTransparency = 1
	title.Size = UDim2.new(1, 0, 0, 22)
	title.Text = ("🔍  Preview — %d pending action(s)"):format(#pendingPreview)
	title.Font = Enum.Font.GothamBold
	title.TextSize = 14
	title.TextColor3 = C.text
	title.TextXAlignment = Enum.TextXAlignment.Left
	title.ZIndex = 62

	local subtitle = Instance.new("TextLabel", box)
	subtitle.BackgroundTransparency = 1
	subtitle.Position = UDim2.new(0, 0, 0, 24)
	subtitle.Size = UDim2.new(1, 0, 0, 16)
	subtitle.Text = "Review what the AI generated. Apply All inserts into Studio (edit mode, undoable)."
	subtitle.Font = Enum.Font.Gotham
	subtitle.TextSize = 11
	subtitle.TextColor3 = C.textDim
	subtitle.TextXAlignment = Enum.TextXAlignment.Left
	subtitle.ZIndex = 62

	local scroll = Instance.new("ScrollingFrame", box)
	scroll.Position = UDim2.new(0, 0, 0, 46)
	scroll.Size = UDim2.new(1, 0, 1, -88)
	scroll.BackgroundColor3 = C.bg
	scroll.BorderSizePixel = 0
	scroll.CanvasSize = UDim2.new(0, 0, 0, 0)
	scroll.AutomaticCanvasSize = Enum.AutomaticSize.Y
	scroll.ScrollBarThickness = 6
	scroll.ZIndex = 62
	corner(scroll, 6)

	local listLayout = Instance.new("UIListLayout", scroll)
	listLayout.Padding = UDim.new(0, 6)
	listLayout.SortOrder = Enum.SortOrder.LayoutOrder
	local scrollPad = Instance.new("UIPadding", scroll)
	scrollPad.PaddingTop = UDim.new(0, 6)
	scrollPad.PaddingBottom = UDim.new(0, 6)
	scrollPad.PaddingLeft = UDim.new(0, 8)
	scrollPad.PaddingRight = UDim.new(0, 8)

	-- Build a human-readable summary line for any action type so the user
	-- can tell at a glance which folders/files will be created, moved, or
	-- renamed before clicking Apply.
	local function describeAction(a)
		local t = tostring(a.type or "?")
		if t == "move" then
			return ("Move  %s  →  %s"):format(tostring(a.path or "?"), tostring(a.newParent or a.parent or "?"))
		elseif t == "rename" then
			return ("Rename  %s  →  %s"):format(tostring(a.path or "?"), tostring(a.newName or a.name or "?"))
		elseif t == "organize" then
			local items = a.items or a.objects or {}
			local dest = tostring(a.parent or "Workspace") .. "/" .. tostring(a.name or a.folderName or "Folder")
			local sample = {}
			for i = 1, math.min(4, #items) do table.insert(sample, tostring(items[i])) end
			local more = (#items > 4) and (" (+ " .. (#items - 4) .. " more)") or ""
			return ("Organize  →  %s  [%d item(s)]\n  • %s%s"):format(dest, #items, table.concat(sample, "\n  • "), more)
		elseif t == "delete" then
			return ("Delete  %s"):format(tostring(a.path or "?"))
		elseif t == "script" then
			return ("Script  %s  in  %s  (%s)"):format(
				tostring(a.name or "?"),
				tostring(a.parent or a.service_location or "ServerScriptService"),
				tostring(a.className or a.file_type or "Script"))
		elseif t == "create" then
			return ("Create  %s  '%s'  in  %s"):format(
				tostring(a.className or "Instance"),
				tostring(a.name or "?"),
				tostring(a.parent or "Workspace"))
		elseif t == "set" then
			return ("Set props on  %s"):format(tostring(a.path or "?"))
		elseif t == "insertAsset" then
			return ("Insert asset  %s  →  %s/%s"):format(
				tostring(a.assetId or "?"), tostring(a.parent or "Workspace"), tostring(a.name or "Asset"))
		end
		return ("%s  %s"):format(t, tostring(a.name or a.path or a.parent or ""))
	end

	-- Track per-action skip state. Skipped items stay in pendingPreview
	-- but are filtered out at Apply time.
	local skipFlags = {}

	for i, a in ipairs(pendingPreview) do
		local row = Instance.new("Frame", scroll)
		row.LayoutOrder = i
		row.BackgroundColor3 = C.panel
		row.BorderSizePixel = 0
		row.AutomaticSize = Enum.AutomaticSize.Y
		row.Size = UDim2.new(1, -4, 0, 0)
		row.ZIndex = 63
		corner(row, 6)
		stroke(row, C.stroke, 1)
		local rp = Instance.new("UIPadding", row)
		rp.PaddingTop = UDim.new(0, 6); rp.PaddingBottom = UDim.new(0, 6)
		rp.PaddingLeft = UDim.new(0, 8); rp.PaddingRight = UDim.new(0, 8)
		local rl = Instance.new("UIListLayout", row)
		rl.Padding = UDim.new(0, 4); rl.SortOrder = Enum.SortOrder.LayoutOrder

		-- Top line: skip toggle + action type tag
		local topRow = Instance.new("Frame", row)
		topRow.LayoutOrder = 1
		topRow.BackgroundTransparency = 1
		topRow.Size = UDim2.new(1, 0, 0, 18)
		topRow.ZIndex = 64

		local skipBtn = Instance.new("TextButton", topRow)
		skipBtn.Size = UDim2.fromOffset(64, 18)
		skipBtn.Position = UDim2.new(1, -64, 0, 0)
		skipBtn.BackgroundColor3 = C.bg
		skipBtn.TextColor3 = C.textDim
		skipBtn.Font = Enum.Font.GothamMedium
		skipBtn.TextSize = 10
		skipBtn.Text = "Include"
		skipBtn.BorderSizePixel = 0
		skipBtn.AutoButtonColor = false
		skipBtn.ZIndex = 65
		corner(skipBtn, 4); stroke(skipBtn, C.stroke, 1)

		local typeTag = Instance.new("TextLabel", topRow)
		typeTag.BackgroundTransparency = 1
		typeTag.Size = UDim2.new(1, -72, 1, 0)
		typeTag.Font = Enum.Font.GothamBold
		typeTag.TextSize = 10
		typeTag.TextColor3 = a.error and Color3.fromRGB(255, 120, 120) or C.accent
		typeTag.TextXAlignment = Enum.TextXAlignment.Left
		typeTag.Text = ("#%d  ·  %s%s"):format(
			i,
			string.upper(tostring(a.type or "?")),
			a.error and "  ·  FAILED" or "")
		typeTag.ZIndex = 65

		-- If the action previously failed during Apply All, paint the row
		-- with a red tint so it's visually obvious it needs attention.
		if a.error then
			row.BackgroundColor3 = Color3.fromRGB(48, 22, 28)
		end

		skipBtn.MouseButton1Click:Connect(function()
			skipFlags[i] = not skipFlags[i]
			if skipFlags[i] then
				skipBtn.Text = "Skipped"
				skipBtn.TextColor3 = Color3.fromRGB(240, 140, 80)
				row.BackgroundTransparency = 0.55
			else
				skipBtn.Text = "Include"
				skipBtn.TextColor3 = C.textDim
				row.BackgroundTransparency = 0
			end
		end)

		local header = Instance.new("TextLabel", row)
		header.LayoutOrder = 2
		header.BackgroundTransparency = 1
		header.AutomaticSize = Enum.AutomaticSize.Y
		header.Size = UDim2.new(1, 0, 0, 0)
		header.Font = Enum.Font.GothamMedium
		header.TextSize = 12
		header.TextColor3 = C.text
		header.TextXAlignment = Enum.TextXAlignment.Left
		header.TextYAlignment = Enum.TextYAlignment.Top
		header.TextWrapped = true
		header.Text = describeAction(a)
		header.ZIndex = 64

		if a.source and #a.source > 0 then
			local snippet = a.source
			if #snippet > 1200 then snippet = snippet:sub(1, 1200) .. "\n... (truncated)" end
			local code = Instance.new("TextLabel", row)
			code.LayoutOrder = 3
			code.BackgroundColor3 = C.bg
			code.BorderSizePixel = 0
			code.AutomaticSize = Enum.AutomaticSize.Y
			code.Size = UDim2.new(1, 0, 0, 0)
			code.Font = Enum.Font.Code
			code.TextSize = 10
			code.TextColor3 = C.textDim
			code.TextXAlignment = Enum.TextXAlignment.Left
			code.TextYAlignment = Enum.TextYAlignment.Top
			code.TextWrapped = true
			code.Text = snippet
			code.ZIndex = 64
			corner(code, 4)
			local cp = Instance.new("UIPadding", code)
			cp.PaddingTop = UDim.new(0, 4); cp.PaddingBottom = UDim.new(0, 4)
			cp.PaddingLeft = UDim.new(0, 6); cp.PaddingRight = UDim.new(0, 6)
		end

		-- Render the captured error from a previous Apply All run, so the
		-- user can see exactly why this action failed and decide to skip,
		-- fix it on the website side, or retry.
		if a.error then
			local errLabel = Instance.new("TextLabel", row)
			errLabel.LayoutOrder = 4
			errLabel.BackgroundColor3 = Color3.fromRGB(70, 24, 32)
			errLabel.BorderSizePixel = 0
			errLabel.AutomaticSize = Enum.AutomaticSize.Y
			errLabel.Size = UDim2.new(1, 0, 0, 0)
			errLabel.Font = Enum.Font.GothamMedium
			errLabel.TextSize = 11
			errLabel.TextColor3 = Color3.fromRGB(255, 190, 190)
			errLabel.TextXAlignment = Enum.TextXAlignment.Left
			errLabel.TextYAlignment = Enum.TextYAlignment.Top
			errLabel.TextWrapped = true
			errLabel.Text = "⚠ " .. tostring(a.error)
			errLabel.ZIndex = 64
			corner(errLabel, 4)
			local ep = Instance.new("UIPadding", errLabel)
			ep.PaddingTop = UDim.new(0, 4); ep.PaddingBottom = UDim.new(0, 4)
			ep.PaddingLeft = UDim.new(0, 6); ep.PaddingRight = UDim.new(0, 6)
		end
	end

	-- Bottom button row
	local btnRow = Instance.new("Frame", box)
	btnRow.AnchorPoint = Vector2.new(0, 1)
	btnRow.Position = UDim2.new(0, 0, 1, 0)
	btnRow.Size = UDim2.new(1, 0, 0, 32)
	btnRow.BackgroundTransparency = 1
	btnRow.ZIndex = 62
	local bl = Instance.new("UIListLayout", btnRow)
	bl.FillDirection = Enum.FillDirection.Horizontal
	bl.HorizontalAlignment = Enum.HorizontalAlignment.Right
	bl.Padding = UDim.new(0, 8)

	local function bigBtn(text, color, textColor, order)
		local b = Instance.new("TextButton", btnRow)
		b.LayoutOrder = order
		b.Size = UDim2.new(0, 130, 1, 0)
		b.BackgroundColor3 = color
		b.TextColor3 = textColor
		b.Font = Enum.Font.GothamBold
		b.TextSize = 12
		b.BorderSizePixel = 0
		b.AutoButtonColor = true
		b.Text = text
		b.ZIndex = 63
		corner(b, 6)
		return b
	end

	local cancel  = bigBtn("Close",       C.panel,   C.textDim, 1)
	local discard = bigBtn("Discard All", C.panel,   Color3.fromRGB(240,80,80), 2)
	local apply   = bigBtn("Apply All",   C.primary, Color3.new(1,1,1), 3)
	stroke(cancel, C.stroke, 1); stroke(discard, C.stroke, 1)

	cancel.MouseButton1Click:Connect(closePreviewOverlay)
	discard.MouseButton1Click:Connect(function()
		local batch = pendingPreview
		pendingPreview = {}
		previewSeenIds = {}
		refreshReviewBtnLabel()
		closePreviewOverlay()
		reportDiscarded(batch)
		statsSkipped = statsSkipped + #batch
		pcall(refreshStatsInfo)
		syncInfo.Text = ("Discarded %d pending action(s)"):format(#batch)
	end)
	apply.MouseButton1Click:Connect(function()
		-- Split pending into "apply now" vs "skipped" based on per-row toggles.
		local toApply, toDiscard = {}, {}
		for i, act in ipairs(pendingPreview) do
			if skipFlags[i] then table.insert(toDiscard, act) else table.insert(toApply, act) end
		end
		pendingPreview = {}
		previewSeenIds = {}
		refreshReviewBtnLabel()
		closePreviewOverlay()
		if #toDiscard > 0 then
			reportDiscarded(toDiscard)
			statsSkipped = statsSkipped + #toDiscard
			pcall(refreshStatsInfo)
		end
		if #toApply > 0 then
			local okN, failN, failedDetails = applyActions(toApply, "preview apply")
			-- If anything failed, re-queue just the failed actions with their
			-- error attached, and re-open the overlay so the user can see
			-- exactly what broke and why.
			if failedDetails and #failedDetails > 0 then
				for _, fd in ipairs(failedDetails) do
					fd.action.error = fd.error
					table.insert(pendingPreview, fd.action)
					local key = fd.action.id or (tostring(fd.action.type) .. ":" .. tostring(fd.action.name))
					previewSeenIds[key] = true
				end
				refreshReviewBtnLabel()
				syncInfo.Text = ("Applied %d, %d failed (review below)"):format(okN or 0, failN or #failedDetails)
				task.defer(openPreviewOverlay)
			else
				syncInfo.Text = ("Applied %d, skipped %d"):format(#toApply, #toDiscard)
			end
		else
			syncInfo.Text = ("Nothing applied — skipped %d"):format(#toDiscard)
		end
	end)
end

reviewBtn.MouseButton1Click:Connect(openPreviewOverlay)
previewToggleBtn.MouseButton1Click:Connect(function()
	setPreview(not getPreview())
	refreshPreviewToggleLabel()
	if not getPreview() and #pendingPreview > 0 then
		-- Turning preview OFF with pending items: apply them now.
		local batch = pendingPreview
		pendingPreview = {}
		previewSeenIds = {}
		refreshReviewBtnLabel()
		applyActions(batch, "preview off")
	end
end)

local function pull(manual)
	if not activeProjectId then return end
	if getPaused() then syncInfo.Text = "Paused — incoming actions are ignored"; return end
	local data, err = postJSON("/sync", { projectId = activeProjectId, manual = manual == true })
	if not data then syncInfo.Text = "Sync error: " .. tostring(err); return end
	lastSyncAt = os.time()
	pcall(refreshStatsInfo)

	local actions = data.actions or {}
	if #actions == 0 then return end
	appendLog("Command received: " .. tostring(#actions) .. " action(s)")
	-- An incoming build typically spends credits — refresh the displayed balance.
	refreshCredits(true)

	-- Preview mode: stash actions for user review, do NOT touch the place.
	if getPreview() then
		local added = 0
		for _, a in ipairs(actions) do
			local key = a.id or (tostring(a.type) .. ":" .. tostring(a.name) .. ":" .. tostring(a.parent))
			if not previewSeenIds[key] then
				previewSeenIds[key] = true
				table.insert(pendingPreview, a)
				added = added + 1
			end
		end
		refreshReviewBtnLabel()
		if added > 0 then
			syncInfo.Text = ("Preview: %d new action(s) queued · opening review…"):format(added)
			setPill("idle")
			-- Auto-open the preview overlay so the user immediately sees
			-- what's about to run before they approve it.
			task.defer(openPreviewOverlay)
		end
		return
	end

	local fp = fingerprintActions(actions)
	if fp == lastFingerprint then return end
	lastFingerprint = fp

	applyActions(actions, "build")
end


local function pushContext(force)
	if not activeProjectId then return end
	if getClearMode() then
		ctxInfo.Text = "Clear Mode — context skipped"
		return
	end
	local now = os.time()
	if not force and (now - lastContextSentAt) < CTX_SECONDS then return end
	lastContextSentAt = now
	local ctx = buildContext()
	local _, err = postJSON("/context", { projectId = activeProjectId, context = ctx })
	if err then
		ctxInfo.Text = "Context error: " .. tostring(err)
	else
		ctxInfo.Text = ("Context: %d instances%s"):format(
			ctx.instanceCount, ctx.truncated and " (truncated)" or "")
	end
end

-- One-time consent dialog. Discloses exactly what data leaves Studio and
-- where it goes, in line with Roblox's plugin Community Standards (transparency
-- about HTTP requests + remote code/asset insertion).
local function showConsentDialog(onAccept)
	pcall(function() widget.Enabled = true end)
	local overlay = Instance.new("Frame", widget)
	overlay.Size = UDim2.fromScale(1,1)
	overlay.BackgroundColor3 = Color3.new(0,0,0)
	overlay.BackgroundTransparency = 0.3
	overlay.BorderSizePixel = 0
	overlay.ZIndex = 50

	local box = Instance.new("Frame", overlay)
	box.Size = UDim2.new(1,-24,1,-24)
	box.Position = UDim2.new(0,12,0,12)
	box.BackgroundColor3 = C.panel
	box.BorderSizePixel = 0
	box.ZIndex = 51
	corner(box, 10); stroke(box, C.stroke, 1); padAll(box, 14)

	local boxList = Instance.new("UIListLayout", box)
	boxList.Padding = UDim.new(0,8); boxList.SortOrder = Enum.SortOrder.LayoutOrder

	local h = Instance.new("TextLabel", box)
	h.LayoutOrder = 1; h.BackgroundTransparency = 1
	h.Size = UDim2.new(1,0,0,20)
	h.Font = Enum.Font.GothamBold; h.TextSize = 14
	h.TextColor3 = C.text; h.Text = "Before you connect"
	h.TextXAlignment = Enum.TextXAlignment.Left; h.ZIndex = 52

	local body = Instance.new("TextLabel", box)
	body.LayoutOrder = 2; body.BackgroundTransparency = 1
	body.Size = UDim2.new(1,0,0,180); body.AutomaticSize = Enum.AutomaticSize.Y
	body.Font = Enum.Font.Gotham; body.TextSize = 11
	body.TextColor3 = C.textDim; body.TextWrapped = true
	body.TextXAlignment = Enum.TextXAlignment.Left
	body.TextYAlignment = Enum.TextYAlignment.Top
	body.ZIndex = 52
	body.Text =
		"BloxSmith communicates with bloxsmith.pro to let an AI generate Roblox code for you. " ..
		"By connecting you agree that this plugin will:\n\n" ..
		"  • Send your scripts' source and a snapshot of your workspace tree (instance names, " ..
		"classes, properties — no players or PII) to bloxsmith.pro.\n" ..
		"  • Apply the scripts, parts, GUIs, RemoteEvents and free-model assets the AI returns " ..
		"into your open place. Every batch is recorded as one undoable step (Ctrl+Z).\n" ..
		"  • Use Roblox's InsertService to load only public Toolbox / free-model assets by ID.\n\n" ..
		"You can pause sync or disconnect at any time. BloxSmith does not modify games you do " ..
		"not own, does not collect player data, and follows Roblox's Plugin Community Standards."

	local btnRow = Instance.new("Frame", box)
	btnRow.LayoutOrder = 3; btnRow.BackgroundTransparency = 1
	btnRow.Size = UDim2.new(1,0,0,34); btnRow.ZIndex = 52

	local cancel = Instance.new("TextButton", btnRow)
	cancel.Size = UDim2.new(0.45,-4,1,0); cancel.Position = UDim2.new(0,0,0,0)
	cancel.BackgroundColor3 = C.disconnect; cancel.TextColor3 = C.text
	cancel.Font = Enum.Font.GothamMedium; cancel.TextSize = 12
	cancel.Text = "Cancel"; cancel.BorderSizePixel = 0; cancel.ZIndex = 52
	corner(cancel, 6)

	local accept = Instance.new("TextButton", btnRow)
	accept.Size = UDim2.new(0.55,-4,1,0); accept.Position = UDim2.new(0.45,8,0,0)
	accept.BackgroundColor3 = C.primary; accept.TextColor3 = Color3.new(1,1,1)
	accept.Font = Enum.Font.GothamBold; accept.TextSize = 12
	accept.Text = "I agree — Connect"; accept.BorderSizePixel = 0; accept.ZIndex = 52
	corner(accept, 6)

	cancel.MouseButton1Click:Connect(function() overlay:Destroy() end)
	accept.MouseButton1Click:Connect(function()
		setConsent(true)
		overlay:Destroy()
		onAccept()
	end)
end

local function doConnect()
	-- Trim whitespace/newlines from pasted token to avoid silent 401s
	local raw = tokenBox.Text or ""
	local trimmed = (raw:gsub("^%s+", ""):gsub("%s+$", ""))
	if trimmed ~= raw then tokenBox.Text = trimmed end
	if trimmed == "" then
		status.Text = "Paste a plugin token first"
		status.TextColor3 = C.warn
		setPill("offline")
		appendLog("No plugin token entered. Generate one at bloxsmith.pro → Settings → Plugin.")
		shouldBeConnected = false
		return false
	end
	setToken(trimmed)
	status.Text = "Connecting..."
	setPill("connecting")
	local data, err = postJSON("/auth", {})
	if not data then
		status.Text = "Failed: " .. tostring(err)
		setPill("offline")
		appendLog("Connection error: " .. tostring(err))
		-- If it's a permanent authentication error (401 or 403), stop auto-retrying
		if err and (string.find(err, "401") or string.find(err, "403")) then
			shouldBeConnected = false
			status.Text = "Invalid token — get a new one at bloxsmith.pro"
			appendLog("Token rejected. Open bloxsmith.pro → Settings → Plugin, click 'Generate token', and paste it here.")
		end
		return false
	end

	connected = true
	if data.user.credits ~= nil then setCreditsDisplay(data.user.credits); lastCreditsAt = os.time() end
	local creditsTxt = (data.user.credits ~= nil) and (" · " .. tostring(data.user.credits) .. " credits") or ""
	status.Text = "Connected as " .. (data.user.display_name or data.user.email) .. creditsTxt
	status.TextColor3 = C.text
	connectBtn.Text = "Disconnect"
	connectBtn:SetAttribute("Base", "disconnect")
	connectBtn.BackgroundColor3 = C.disconnect
	connectGrad.Enabled = false
	setPill("connected")
	appendLog("Plugin connected" .. ((data.user.credits ~= nil) and (" — " .. tostring(data.user.credits) .. " credits remaining") or ""))

	local first = (data.projects or {})[1]
	if first then
		activeProjectId = first.id; activeProjectName = first.name
		status.Text = "Connected as " .. (data.user.display_name or data.user.email) .. creditsTxt .. " · Project: " .. first.name
		syncInfo.Text = "Auto-building: " .. first.name
		syncInfo.TextColor3 = C.text
		pushContext(true)
		pull()
		task.defer(pushSnapshot)
	else
		syncInfo.Text = "No projects yet — create one on the website"
	end
	return true
end

local function connect()
	shouldBeConnected = true
	if not getConsent() then
		showConsentDialog(doConnect)
		return
	end
	doConnect()
end

local function disconnect()
	shouldBeConnected = false
	connected = false; activeProjectId = nil
	lastFingerprint = nil; lastContextSentAt = 0
	scanInProgress = false; scanCancelRequested = false
	setCreditsDisplay(nil)
	status.Text = "Not connected"; status.TextColor3 = C.textDim
	syncInfo.Text = "—"; syncInfo.TextColor3 = C.textDim
	ctxInfo.Text = "—"; ctxInfo.TextColor3 = C.textDim
	connectBtn.Text = "Connect"
	connectBtn:SetAttribute("Base", "primary")
	connectBtn.BackgroundColor3 = C.primary
	connectGrad.Enabled = true
	setPill("offline")
	appendLog("Plugin disconnected")
end

connectBtn.MouseButton1Click:Connect(function()
	if connected or shouldBeConnected then disconnect() else connect() end
end)
syncNowBtn.MouseButton1Click:Connect(function()
	if not connected then
		syncInfo.Text = "Connect before syncing"
		appendLog("Sync requested while offline")
		return
	end
	task.spawn(function()
		pushContext(true)
		pull(true) -- user-initiated: bypass "Manual sync only" gating server-side
		pushSnapshot()
	end)
end)
reconnectBtn.MouseButton1Click:Connect(function()
	disconnect()
	shouldBeConnected = true
	task.defer(connect)
end)
cancelScanBtn.MouseButton1Click:Connect(function()
	scanCancelRequested = true
	appendLog("Scan cancel requested")
end)
cleanSyncedBtn.MouseButton1Click:Connect(function()
	-- Remove the artifacts the old buggy sync left behind:
	--   1) ServerStorage/__BloxSmithPreloadToken
	--   2) Duplicate / recursively-nested StarterPlayerScripts folders inside StarterPlayer
	--   3) Stray loose script copies directly under StarterPlayer (they belong in StarterPlayerScripts)
	local removed = 0
	local recId
	if ChangeHistoryService.TryBeginRecording then
		recId = ChangeHistoryService:TryBeginRecording("BloxSmith clean synced", "Remove auto-sync artifacts")
	end

	local tok = ServerStorage:FindFirstChild("__BloxSmithPreloadToken")
	if tok then tok:Destroy(); removed = removed + 1 end

	local sps = StarterPlayer:FindFirstChild("StarterPlayerScripts")
	if sps then
		-- Kill any nested StarterPlayerScripts inside StarterPlayerScripts
		local function killNested(parent, depth)
			if depth > 8 then return end
			for _, child in ipairs(parent:GetChildren()) do
				if child.Name == "StarterPlayerScripts" then
					child:Destroy(); removed = removed + 1
				else
					killNested(child, depth + 1)
				end
			end
		end
		killNested(sps, 0)
	end

	-- Remove any loose script (Script/LocalScript/ModuleScript) directly under StarterPlayer
	for _, child in ipairs(StarterPlayer:GetChildren()) do
		if child:IsA("LuaSourceContainer") then
			child:Destroy(); removed = removed + 1
		end
	end

	if recId and ChangeHistoryService.FinishRecording then
		ChangeHistoryService:FinishRecording(recId, Enum.FinishRecordingOperation.Commit)
	end

	syncInfo.Text = ("Cleaned %d auto-synced artifact(s)"):format(removed)
	appendLog("Clean Synced: removed " .. tostring(removed) .. " object(s)")
	task.defer(pushSnapshot)
end)

-- Test Connection: pings the server with the current token + API URL and
-- reports whether the token is valid and the server is reachable. Works
-- whether or not a project is currently connected.
testConnBtn.MouseButton1Click:Connect(function()
	if getToken() == "" then
		syncInfo.Text = "❌ Test failed — no plugin token set"
		appendLog("Test Connection: no token")
		return
	end
	local originalText = testConnBtn.Text
	testConnBtn.Text = "Testing…"
	task.spawn(function()
		local apiBase = getApiBase()
		local probeId = activeProjectId or "00000000-0000-0000-0000-000000000000"
		local ok, res = pcall(function()
			return HttpService:RequestAsync({
				Url = apiBase .. "/sync",
				Method = "POST",
				Headers = {
					["Content-Type"] = "application/json",
					["x-plugin-token"] = getToken(),
				},
				Body = HttpService:JSONEncode({ projectId = probeId, manual = true }),
			})
		end)
		testConnBtn.Text = originalText
		if not ok then
			syncInfo.Text = "❌ Cannot reach " .. apiBase
			appendLog("Test Connection failed: " .. tostring(res))
			return
		end
		local code = res.StatusCode
		if code == 401 or code == 403 then
			syncInfo.Text = "❌ Token rejected by server (HTTP " .. code .. ")"
			appendLog("Test Connection: token rejected (" .. code .. ")")
		elseif code >= 200 and code < 500 then
			-- 2xx = full success; 404/409/400 = server reachable + token
			-- valid, just no/invalid project — still a healthy probe.
			syncInfo.Text = ("✅ Server reachable · token OK (HTTP %d)"):format(code)
			appendLog("Test Connection: OK (" .. code .. ")")
		else
			syncInfo.Text = ("⚠️ Server error HTTP %d"):format(code)
			appendLog("Test Connection: server error " .. code)
		end
	end)
end)

button.Click:Connect(function() widget.Enabled = not widget.Enabled end)

-- Action-pull loop: tight 0.2s tick so scan/script actions get picked up almost
-- instantly. Auto-reconnect lives here too. We deliberately DO NOT call the
-- heavier pushContext() here — that runs on its own slower loop below so a
-- big buildContext() can't stall pulling the next action.
task.spawn(function()
	local lastRetryTime = 0
	while true do
		task.wait(POLL_SECONDS)

		if shouldBeConnected and not connected then
			local now = os.time()
			if now - lastRetryTime >= 5 then
				lastRetryTime = now
				pcall(doConnect)
			end
		end

		if connected then
			pcall(pull)
		end
	end
end)

-- Context-push loop: heavier workspace snapshot, throttled internally by
-- CTX_SECONDS. Runs on its own thread so it never blocks action polling.
task.spawn(function()
	while true do
		task.wait(2)
		if connected then
			pcall(pushContext, false)
		end
	end
end)

-- Credits refresh loop: poll the lightweight /credits endpoint every 20s so
-- the on-plugin balance stays accurate after promo claims, daily rewards, or
-- credits spent by web-side builds.
task.spawn(function()
	while true do
		task.wait(20)
		if connected then
			pcall(refreshCredits, true)
		end
	end
end)

-- React to user-side changes so AI stays in sync
Workspace.DescendantAdded:Connect(function()
	if connected then lastContextSentAt = 0 end
end)
Workspace.DescendantRemoving:Connect(function()
	if connected then lastContextSentAt = 0 end
end)

-- Auto-connect only if a token is saved AND the user has previously granted
-- consent. First-run users always see the disclosure dialog.
if getToken() ~= "" and getConsent() then
	shouldBeConnected = true
	task.defer(doConnect)
end
