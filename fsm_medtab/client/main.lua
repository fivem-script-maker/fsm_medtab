--[[
    fsm_medtab — EMS Medical Tablet (client)

    The client owns what only the client can own: NUI focus, the natives that
    read the local ped and vehicle, animations, blips and the route. It owns no
    truth. Every button on the tablet posts here, and every post is forwarded
    to the server, which decides what actually happens and sends back the state
    the interface then draws.
]]

local QBCore = exports['qb-core']:GetCoreObject()

local isOpen = false          -- is the tablet on screen
local onDuty = false          -- are we an on-duty medic (drives the threads)
local callBlips = {}          -- [callRef] = blip handle
local routeBlip = nil         -- the blip currently carrying the GPS route
local activeToken = nil       -- the treatment the progress bar is running
local lastBoneReport = 0

-- ══ NUI lifecycle ═════════════════════════════════════════════════════════

local function setTablet(open)
    if open == isOpen then return end
    isOpen = open

    SetNuiFocus(open, open)

    if open then
        -- Owner-controlled settings travel with the open message. The NUI keeps
        -- no copy of its own, so changing config.lua is enough to change what
        -- the tablet does.
        SendNUIMessage({
            action = 'open',
            map = { tileUrl = Config.MapTileUrl ~= '' and Config.MapTileUrl or nil },
        })
        TriggerServerEvent('fsm_medtab:server:open')
    else
        SendNUIMessage({ action = 'close' })
        TriggerServerEvent('fsm_medtab:server:close')
    end
end

RegisterCommand(Config.Command, function()
    setTablet(not isOpen)
end, false)

if Config.OpenWithKeybind then
    RegisterKeyMapping(Config.Command, Config.KeyMappingLabel, 'keyboard', Config.Keybind)
end

-- The UI's close button and the Escape key both call window.fsmNui.close(),
-- which posts here. Without this the panel would hide itself and the player
-- would keep a focused, invisible NUI.
RegisterNUICallback('close', function(_, cb)
    setTablet(false)
    cb({ ok = true })
end)

-- Live state from the server, forwarded straight into the interface.
RegisterNetEvent('fsm_medtab:client:state', function(payload)
    if not isOpen then return end
    SendNUIMessage(payload)
end)

RegisterNetEvent('fsm_medtab:client:toast', function(toast)
    if not isOpen then
        QBCore.Functions.Notify(('%s%s'):format(toast.title or '', toast.body and (' — ' .. toast.body) or ''), 'primary')
        return
    end
    SendNUIMessage({ action = 'toast', data = toast })
end)

RegisterNetEvent('fsm_medtab:client:denied', function(reason)
    setTablet(false)
    QBCore.Functions.Notify(('Medical tablet unavailable — %s.'):format(reason or 'not authorised'), 'error')
end)

RegisterNetEvent('fsm_medtab:client:forceClose', function(reason)
    if isOpen then
        setTablet(false)
        QBCore.Functions.Notify(('Medical tablet closed — %s.'):format(reason or 'no longer on duty'), 'error')
    end
end)

-- ══ NUI callbacks — every one forwards to the server ══════════════════════
--
--  Nothing below decides anything. The tablet asks; the server answers by
--  pushing a new state. That is why each callback replies { ok = true } and
--  nothing more: the button has been heard, not granted.

local function forward(name, build)
    RegisterNUICallback(name, function(data, cb)
        build(type(data) == 'table' and data or {})
        cb({ ok = true })
    end)
end

forward('setStatus', function(data)
    TriggerServerEvent('fsm_medtab:server:setStatus', data.code)
end)

forward('callAction', function(data)
    TriggerServerEvent('fsm_medtab:server:callAction', data.id, data.action)
end)

forward('takeSupply', function(data)
    TriggerServerEvent('fsm_medtab:server:takeSupply', data.item, data.amount)
end)

forward('returnSupply', function(data)
    TriggerServerEvent('fsm_medtab:server:returnSupply', data.item, data.amount)
end)

forward('beginTreatment', function(data)
    TriggerServerEvent('fsm_medtab:server:beginTreatment', data.protocol, data.patient)
end)

forward('cancelTreatment', function(data)
    if data.token then TriggerServerEvent('fsm_medtab:server:cancelTreatment', data.token) end
end)

forward('fileReport', function(data)
    TriggerServerEvent('fsm_medtab:server:fileReport', data)
end)

forward('pageUnit', function(data)
    TriggerServerEvent('fsm_medtab:server:pageUnit', data.callsign)
end)

-- Waypoint straight from the map, without taking the call.
forward('setWaypoint', function(data)
    local x, y = tonumber(data.x), tonumber(data.y)
    if x and y then
        SetNewWaypoint(x + 0.0, y + 0.0)
    end
end)

-- ══ treatment — the progress bar the server authorised ════════════════════

RegisterNetEvent('fsm_medtab:client:runTreatment', function(token, protocol)
    if activeToken then return end
    activeToken = token

    -- The interface draws its own timer from the same duration the server is
    -- measuring, so the bar and the rule behind it cannot drift apart.
    SendNUIMessage({ action = 'treatmentStarted', data = {
        token = token, protocol = protocol.id, name = protocol.name, seconds = protocol.seconds,
    } })

    local animation = nil
    if protocol.anim and protocol.anim.dict then
        animation = { animDict = protocol.anim.dict, anim = protocol.anim.clip, flags = 49 }
    end

    QBCore.Functions.Progressbar('fsm_medtab_treat', protocol.name, protocol.seconds * 1000,
        false, true,
        { disableMovement = true, disableCarMovement = true, disableMouse = false, disableCombat = true },
        animation, {}, {},
        function() -- finished
            activeToken = nil
            ClearPedTasks(PlayerPedId())
            TriggerServerEvent('fsm_medtab:server:finishTreatment', token)
            SendNUIMessage({ action = 'treatmentEnded', data = { token = token, completed = true } })
        end,
        function() -- cancelled
            activeToken = nil
            ClearPedTasks(PlayerPedId())
            TriggerServerEvent('fsm_medtab:server:cancelTreatment', token)
            SendNUIMessage({ action = 'treatmentEnded', data = { token = token, completed = false } })
        end)
end)

--- Applied on the PATIENT's own machine: SetEntityHealth and the resurrect
--- native are client-side and only this client owns this ped.
RegisterNetEvent('fsm_medtab:client:applyTreatment', function(data)
    local ped = PlayerPedId()

    if data.revive and IsEntityDead(ped) then
        local coords = GetEntityCoords(ped)
        local heading = GetEntityHeading(ped)
        NetworkResurrectLocalPlayer(coords.x, coords.y, coords.z, heading, true, false)
        ClearPedTasksImmediately(ped)
        SetEntityHealth(ped, data.reviveHealth or 160)
        ClearPedBloodDamage(ped)

        -- Optional hand-off to qb-ambulancejob, off by default so this
        -- resource does not require it. Turn it on in config.lua if you run it.
        if data.useQBRevive then
            TriggerEvent('hospital:client:Revive')
        end
    elseif (data.heal or 0) > 0 then
        local maxHealth = GetPedMaxHealth(ped)
        SetEntityHealth(ped, math.min(maxHealth, GetEntityHealth(ped) + data.heal))
        ClearPedBloodDamage(ped)
    end

    QBCore.Functions.Notify(('Treated — %s'):format(data.label or 'medical care'), 'success')
end)

-- ══ route and call blips ══════════════════════════════════════════════════

local function clearRouteBlip()
    if routeBlip and DoesBlipExist(routeBlip) then
        SetBlipRoute(routeBlip, false)
    end
    routeBlip = nil
end

RegisterNetEvent('fsm_medtab:client:setRoute', function(coords, ref)
    if not coords then return end
    clearRouteBlip()

    local blip = callBlips[ref]
    if blip and DoesBlipExist(blip) then
        SetBlipRoute(blip, true)
        SetBlipRouteColour(blip, Config.CallBlip.colours[1] or 1)
        routeBlip = blip
    end
    SetNewWaypoint(coords.x + 0.0, coords.y + 0.0)
end)

RegisterNetEvent('fsm_medtab:client:clearRoute', function()
    clearRouteBlip()
end)

--- Keeps the blip set on the minimap in step with the open board. Blips are
--- created and removed here, never left behind: an orphaned blip outlives the
--- call it belonged to and there is no way for a player to clear it.
local function syncCallBlips(calls)
    if not Config.CallBlip.enabled then return end

    local seen = {}
    for _, call in ipairs(calls or {}) do
        seen[call.id] = true
        if not callBlips[call.id] then
            local blip = AddBlipForCoord(call.coords.x + 0.0, call.coords.y + 0.0, (call.coords.z or 0.0) + 0.0)
            SetBlipSprite(blip, Config.CallBlip.sprite)
            SetBlipColour(blip, Config.CallBlip.colours[call.priority] or 1)
            SetBlipScale(blip, Config.CallBlip.scale + 0.0)
            SetBlipAsShortRange(blip, false)
            SetBlipHighDetail(blip, true)
            if call.priority == 1 and Config.CallBlip.flashPriorityOne then
                SetBlipFlashes(blip, true)
            end
            BeginTextCommandSetBlipName('STRING')
            AddTextComponentSubstringPlayerName(('%s  %s'):format(call.id, call.type))
            EndTextCommandSetBlipName(blip)
            callBlips[call.id] = blip
        end
    end

    for ref, blip in pairs(callBlips) do
        if not seen[ref] then
            if DoesBlipExist(blip) then
                if routeBlip == blip then clearRouteBlip() end
                RemoveBlip(blip)
            end
            callBlips[ref] = nil
        end
    end
end

local function clearAllBlips()
    clearRouteBlip()
    for ref, blip in pairs(callBlips) do
        if DoesBlipExist(blip) then RemoveBlip(blip) end
        callBlips[ref] = nil
    end
end

-- The board arrives inside the state push, so blips follow the same source of
-- truth as the tablet rather than a second list that can drift out of step.
RegisterNetEvent('fsm_medtab:client:state', function(payload)
    if payload and payload.data and payload.data.calls then
        syncCallBlips(payload.data.calls)
    end
end)

-- ══ duty state ════════════════════════════════════════════════════════════

local function refreshDuty(playerData)
    local job = playerData and playerData.job
    local allowed = job ~= nil and Config.Jobs[job.name] == true
    if Config.RequireDuty then allowed = allowed and job.onduty == true end

    if onDuty and not allowed then
        clearAllBlips()
        if isOpen then setTablet(false) end
    end
    onDuty = allowed
end

RegisterNetEvent('QBCore:Client:OnPlayerLoaded', function()
    refreshDuty(QBCore.Functions.GetPlayerData())
end)

RegisterNetEvent('QBCore:Client:OnPlayerUnload', function()
    onDuty = false
    clearAllBlips()
    if isOpen then setTablet(false) end
end)

RegisterNetEvent('QBCore:Client:OnPlayerUpdated', function()
    refreshDuty(QBCore.Functions.GetPlayerData())
end)

CreateThread(function()
    -- GetPlayerData takes a callback on the client; the state may not exist yet
    -- on a fresh resource start, which is what OnPlayerLoaded is for.
    QBCore.Functions.GetPlayerData(function(playerData)
        refreshDuty(playerData)
    end)
end)

-- ══ heartbeat — position, street and vehicle ══════════════════════════════
--
--  These natives are client-side, so the server cannot read them itself. The
--  heartbeat is the only way the dispatch map knows where a unit is, and it
--  idles completely while the player is not an on-duty medic.

CreateThread(function()
    while true do
        if not onDuty then
            Wait(2000)
        else
            local ped = PlayerPedId()
            local coords = GetEntityCoords(ped)
            local streetHash = GetStreetNameAtCoord(coords.x, coords.y, coords.z)
            local street = streetHash and GetStreetNameFromHashKey(streetHash) or nil

            local payload = {
                coords = { x = coords.x, y = coords.y, z = coords.z },
                street = street,
                vehicle = nil,
            }

            local vehicle = GetVehiclePedIsIn(ped, false)
            if vehicle and vehicle ~= 0 then
                local model = GetEntityModel(vehicle)
                local plate = GetVehicleNumberPlateText(vehicle)
                payload.vehicle = {
                    hash = model,
                    label = QBCore.Functions.GetVehicleLabel(vehicle) or 'Vehicle',
                    plate = plate and plate:gsub('%s+$', '') or '—',
                    fuel = math.floor(GetVehicleFuelLevel(vehicle) or 0),
                }
            end

            TriggerServerEvent('fsm_medtab:server:heartbeat', payload)
            Wait(math.max(1, Config.HeartbeatSeconds) * 1000)
        end
    end
end)

-- ══ injury reporting — runs for EVERY player, not just medics ═════════════
--
--  GetPedLastDamageBone is client-side and only the injured player's own
--  machine can read it. The thread sleeps while the player is unhurt, so the
--  cost for a healthy server is one check every second and a half.

--- Classifies whatever last did damage, using the table in config.lua.
local function damageClassOf(ped)
    local causeHash = GetPedCauseOfDeath(ped)
    if not causeHash or causeHash == 0 then return 'unknown' end
    for weapon, class in pairs(Config.DamageWeapons) do
        if GetHashKey(weapon) == causeHash then return class end
    end
    -- Anything that did damage and is not listed is a firearm.
    return 'bullet'
end

CreateThread(function()
    local wasDead = false

    while true do
        local ped = PlayerPedId()
        local health = GetEntityHealth(ped)
        local maxHealth = GetPedMaxHealth(ped)
        if not maxHealth or maxHealth <= 100 then maxHealth = 200 end
        local hurt = health < maxHealth
        local dead = IsEntityDead(ped) or health <= 101

        if hurt then
            -- The flag decides, not the bone value: a plausible-looking bone
            -- with a false flag is stale data from an earlier hit.
            local hit, bone = GetPedLastDamageBone(ped)
            if hit and bone and bone ~= 0 and (GetGameTimer() - lastBoneReport) > 900 then
                lastBoneReport = GetGameTimer()
                local coords = GetEntityCoords(ped)
                local streetHash = GetStreetNameAtCoord(coords.x, coords.y, coords.z)

                TriggerServerEvent('fsm_medtab:server:damageReport', {
                    bone = bone,
                    class = damageClassOf(ped),
                    vitality = (health - 100) / math.max(1, maxHealth - 100),
                    street = streetHash and GetStreetNameFromHashKey(streetHash) or nil,
                })
                ClearPedLastDamageBone(ped)
            end
        end

        if dead and not wasDead then
            wasDead = true
            local coords = GetEntityCoords(ped)
            local streetHash = GetStreetNameAtCoord(coords.x, coords.y, coords.z)
            TriggerServerEvent('fsm_medtab:server:playerDown', {
                class = damageClassOf(ped),
                street = streetHash and GetStreetNameFromHashKey(streetHash) or nil,
            })
        elseif not dead and wasDead then
            wasDead = false
        end

        Wait(hurt and 1000 or 1500)
    end
end)

-- ══ cleanup ═══════════════════════════════════════════════════════════════

-- Stopping the resource while the tablet is open would otherwise leave focus
-- held by a resource that no longer exists, and blips with nothing behind them.
AddEventHandler('onResourceStop', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    if isOpen then
        SetNuiFocus(false, false)
    end
    clearAllBlips()
end)
