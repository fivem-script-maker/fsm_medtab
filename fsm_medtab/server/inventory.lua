--[[
    fsm_medtab — inventory bridge (server)

    Item handling is the one place where servers genuinely disagree. qb-core
    used to carry AddItem/RemoveItem on the player object, newer setups moved
    them into qb-inventory, and plenty of QBCore servers run ox_inventory
    instead. The export names are not interchangeable and there is no single
    call that works everywhere.

    So this file picks a backend once, then routes every item movement through
    it. Two rules it never breaks:

      * the CALL goes inside pcall, not the lookup. Indexing a missing export
        (exports['qb-inventory'].AddItem) throws on the index itself, so the
        usual `if exports[res][name] then` guard is the line that crashes.
      * when nothing works it says exactly which names it tried. A bridge that
        reports "tried A, B and C" is a one-line config fix for the owner; one
        that silently does nothing is a bug report.
]]

Medtab = Medtab or {}
Medtab.Inventory = {}

local backend           -- resolved backend name, set on first use
local announced = false -- so the failure report prints once, not every frame

local function running(resource)
    local state = GetResourceState(resource)
    return state == 'started' or state == 'starting'
end

--- Runs fn, swallowing a missing-export throw. Returns ok, value.
local function attempt(fn, ...)
    local ok, result = pcall(fn, ...)
    if not ok then return false, nil end
    return true, result
end

-- ── backend implementations ───────────────────────────────────────────────
-- Each returns true only when the item actually moved.

local impl = {}

impl['ox_inventory'] = {
    add = function(src, _, item, count)
        local ok, res = attempt(function() return exports.ox_inventory:AddItem(src, item, count) end)
        return ok and res ~= false and res ~= nil
    end,
    remove = function(src, _, item, count)
        local ok, res = attempt(function() return exports.ox_inventory:RemoveItem(src, item, count) end)
        return ok and res ~= false
    end,
    count = function(src, _, item)
        local ok, res = attempt(function() return exports.ox_inventory:GetItem(src, item, nil, true) end)
        if ok and type(res) == 'number' then return res end
        return nil
    end,
}

impl['qb-inventory'] = {
    add = function(src, _, item, count)
        local ok, res = attempt(function() return exports['qb-inventory']:AddItem(src, item, count, nil, nil, 'fsm_medtab') end)
        return ok and res ~= false and res ~= nil
    end,
    remove = function(src, _, item, count)
        local ok, res = attempt(function() return exports['qb-inventory']:RemoveItem(src, item, count, nil, 'fsm_medtab') end)
        return ok and res ~= false and res ~= nil
    end,
    count = function(src, _, item)
        local ok, res = attempt(function() return exports['qb-inventory']:GetItemCount(src, item) end)
        if ok and type(res) == 'number' then return res end
        return nil
    end,
}

-- Older qb-core builds carry the item methods on the player object itself.
impl['qb-core'] = {
    add = function(_, Player, item, count)
        if not (Player and Player.Functions) then return false end
        local ok, res = attempt(function() return Player.Functions.AddItem(item, count) end)
        return ok and res ~= false and res ~= nil
    end,
    remove = function(_, Player, item, count)
        if not (Player and Player.Functions) then return false end
        local ok, res = attempt(function() return Player.Functions.RemoveItem(item, count) end)
        return ok and res ~= false and res ~= nil
    end,
    count = function(_, Player, item)
        if not (Player and Player.Functions and Player.Functions.GetItemByName) then return nil end
        local ok, res = attempt(function() return Player.Functions.GetItemByName(item) end)
        if ok and type(res) == 'table' and type(res.amount) == 'number' then return res.amount end
        if ok and res == nil then return 0 end
        return nil
    end,
}

-- Order matters: the most specific, most current option first.
local ORDER = { 'ox_inventory', 'qb-inventory', 'qb-core' }

local function resolve()
    if backend then return backend end

    if Config.Inventory and Config.Inventory ~= 'auto' then
        if impl[Config.Inventory] then
            backend = Config.Inventory
            print(('[fsm_medtab] inventory backend: %s (set in config.lua)'):format(backend))
            return backend
        end
        print(('[fsm_medtab] Config.Inventory is "%s", which is not one of: auto, ox_inventory, qb-inventory, qb-core. Falling back to auto-detect.'):format(tostring(Config.Inventory)))
    end

    for _, name in ipairs(ORDER) do
        -- qb-core is the framework itself, so it is always present; it is the
        -- last resort rather than a detection hit.
        if name == 'qb-core' or running(name) then
            backend = name
            print(('[fsm_medtab] inventory backend: %s (auto-detected)'):format(backend))
            return backend
        end
    end

    backend = 'qb-core'
    return backend
end

--- Prints, once, every export this resource knows how to speak.
local function announceFailure(operation, item)
    if announced then return end
    announced = true
    print('[fsm_medtab] ─────────────────────────────────────────────────────')
    print(('[fsm_medtab] Could not %s "%s" through the inventory.'):format(operation, tostring(item)))
    print(('[fsm_medtab] Backend in use: %s'):format(tostring(backend)))
    print('[fsm_medtab] Names this resource knows how to call:')
    print('[fsm_medtab]   ox_inventory  -> exports.ox_inventory:AddItem / RemoveItem / GetItem')
    print('[fsm_medtab]   qb-inventory  -> exports["qb-inventory"]:AddItem / RemoveItem / GetItemCount')
    print('[fsm_medtab]   qb-core       -> Player.Functions.AddItem / RemoveItem / GetItemByName')
    print('[fsm_medtab] Set Config.Inventory in config.lua to whichever your server actually runs,')
    print(('[fsm_medtab] and make sure the item "%s" exists in that inventory\'s item list.'):format(tostring(item)))
    print('[fsm_medtab] ─────────────────────────────────────────────────────')
end

-- ── public surface ────────────────────────────────────────────────────────

--- Hands `count` of `item` to the player. Returns true only if it landed.
function Medtab.Inventory.Give(src, Player, item, count)
    if not item or (count or 0) < 1 then return false end
    local moved = impl[resolve()].add(src, Player, item, count)
    if not moved then announceFailure('give', item) end
    return moved
end

--- Takes `count` of `item` from the player. Returns true only if it was taken.
function Medtab.Inventory.Take(src, Player, item, count)
    if not item or (count or 0) < 1 then return false end
    local moved = impl[resolve()].remove(src, Player, item, count)
    if not moved then announceFailure('take', item) end
    return moved
end

--- How many the player carries, or nil when the backend cannot say.
function Medtab.Inventory.Count(src, Player, item)
    if not item then return nil end
    return impl[resolve()].count(src, Player, item)
end

--- Does the player hold at least `count`? HasItem is a verified qb-core player
--- method, so it is the most reliable check regardless of which backend moves
--- the items; the bridge is only consulted if it is unavailable.
function Medtab.Inventory.Has(src, Player, item, count)
    count = count or 1
    if Player and Player.Functions and Player.Functions.HasItem then
        local ok, res = attempt(function() return Player.Functions.HasItem(item, count) end)
        if ok and res ~= nil then return res == true end
    end
    local held = Medtab.Inventory.Count(src, Player, item)
    if held == nil then return true end -- unknown: let the removal be the real gate
    return held >= count
end

--- Which backend ended up in use, for the boot banner.
function Medtab.Inventory.Backend()
    return resolve()
end
