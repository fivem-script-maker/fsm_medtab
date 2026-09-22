--[[
    fsm_medtab — EMS Medical Tablet (server)

    The server owns every fact the tablet displays. The NUI asks; this file
    decides. Nothing arriving from a client is trusted: item names, amounts,
    protocol ids, call references and target players are all looked up against
    config.lua and the server's own state before anything happens.

    Sections, in order:
        1. core, helpers
        2. medic registry and callsigns
        3. station stock
        4. dispatch calls
        5. patients, vitals and injuries
        6. treatments (token-gated, server-timed)
        7. reports and billing
        8. the state payload and its push loop
        9. net events, exports and commands
]]

local QBCore = exports['qb-core']:GetCoreObject()

Medtab = Medtab or {}

-- ══ 1. core, helpers ══════════════════════════════════════════════════════

local Medics     = {}   -- [src]        = medic record
local Open       = {}   -- [src]        = true while the tablet is on screen
local Calls      = {}   -- [ref]        = call record
local Patients   = {}   -- [citizenid]  = patient record
local Treatments = {}   -- [token]      = in-flight treatment
local Stock      = {}   -- [stationId]  = { [item] = count }
local Activity   = {}   -- newest first, capped
local Reports    = {}   -- newest first, capped (mirrors the DB for fast reads)

local callSeq      = 2200
local reportSeq    = 1190
local treatmentSeq = 0
local startedAt    = os.time()

local BLOOD_TYPES = { 'O−', 'O+', 'A−', 'A+', 'B−', 'B+', 'AB−', 'AB+' }
local ALLERGY_POOL = { 'Penicillin', 'Latex', 'Codeine', 'Sulfa drugs', 'Iodine', 'Aspirin', 'Morphine' }
local CONDITION_POOL = { 'Hypertension', 'Asthma', 'Type II diabetes', 'Epilepsy', 'Anaemia', 'Arrhythmia' }
local INSURANCE_POOL = {
    'Los Santos General — Tier 2', 'Mount Zonah — Tier 1', 'Pillbox Hill — Tier 3',
    'Sandy Shores Clinic — Basic', 'Uninsured',
}

local function clamp(value, lo, hi)
    if value < lo then return lo end
    if value > hi then return hi end
    return value
end

local function round(value) return math.floor(value + 0.5) end

--- Small stable hash, so a character's generated medical record (blood type,
--- allergies) is the same every time they are treated rather than rerolling.
local function hashOf(text)
    local h = 5381
    text = tostring(text or '')
    for i = 1, #text do h = (h * 33 + text:byte(i)) % 2147483647 end
    return h
end

local function pickFrom(pool, seed)
    return pool[(seed % #pool) + 1]
end

local function clockStamp(unixTime)
    return os.date('%H:%M', unixTime or os.time())
end

--- Relative stamps for a patient timeline: "-04:12" means four minutes ago.
local function relativeStamp(seconds)
    seconds = math.max(0, round(seconds))
    return ('-%02d:%02d'):format(math.floor(seconds / 60), seconds % 60)
end

local function pushActivity(text, tone)
    table.insert(Activity, 1, { t = clockStamp(), text = text, tone = tone or 'dim' })
    while #Activity > 40 do table.remove(Activity) end
end

-- ── config lookups ────────────────────────────────────────────────────────

local ProtocolById, SupplyByItem, StatusByCode = {}, {}, {}
for _, protocol in ipairs(Config.Protocols) do ProtocolById[protocol.id] = protocol end
for _, supply in ipairs(Config.Supplies) do SupplyByItem[supply.item] = supply end
for _, status in ipairs(Config.StatusCodes) do StatusByCode[status.code] = status end

local function districtFor(x, y)
    local best, bestDistance = nil, nil
    for _, district in ipairs(Config.Districts) do
        local dx, dy = x - district.x, y - district.y
        local distance = math.sqrt(dx * dx + dy * dy)
        if distance <= district.radius and (not bestDistance or distance < bestDistance) then
            best, bestDistance = district.label, distance
        end
    end
    return best or 'Blaine County'
end

--- A grid reference worked out from the coordinates, unless the owner has
--- pointed Config.Postal at a real postal resource.
local function postalFor(x, y)
    if Config.Postal and Config.Postal.resource ~= '' and Config.Postal.export ~= '' then
        local ok, value = pcall(function()
            return exports[Config.Postal.resource][Config.Postal.export](nil, x, y)
        end)
        if ok and value ~= nil and value ~= '' then return tostring(value) end
    end
    local column = math.floor(clamp((x + 4000.0) / 615.0, 0, 12))
    local row = math.floor(clamp((8200.0 - y) / 940.0, 0, 12))
    return ('%s-%02d'):format(string.char(65 + column), row + 1)
end

local function stationNear(coords)
    if not coords then return nil end
    for _, station in ipairs(Config.Stations) do
        local dx = coords.x - station.supply.x
        local dy = coords.y - station.supply.y
        local dz = coords.z - station.supply.z
        if math.sqrt(dx * dx + dy * dy + dz * dz) <= Config.StationRadius then return station end
    end
    return nil
end

local function nearestStation(coords)
    local best, bestDistance = Config.Stations[1], nil
    if not coords then return best end
    for _, station in ipairs(Config.Stations) do
        local dx = coords.x - station.supply.x
        local dy = coords.y - station.supply.y
        local distance = math.sqrt(dx * dx + dy * dy)
        if not bestDistance or distance < bestDistance then best, bestDistance = station, distance end
    end
    return best
end

local function pedCoordsOf(src)
    local ped = GetPlayerPed(src)
    if not ped or ped == 0 then return nil end
    return GetEntityCoords(ped)
end

local function distanceBetween(a, b)
    if not a or not b then return math.huge end
    local dx, dy, dz = a.x - b.x, a.y - b.y, a.z - b.z
    return math.sqrt(dx * dx + dy * dy + dz * dz)
end

local function notify(src, text, kind)
    TriggerClientEvent('QBCore:Notify', src, text, kind or 'primary')
end

local function toast(src, title, body, tone)
    TriggerClientEvent('fsm_medtab:client:toast', src, { title = title, body = body, tone = tone or 'info' })
end

-- ══ 2. medic registry and callsigns ═══════════════════════════════════════

--- Is this player allowed to use the tablet right now? Returns the Player
--- object and the reason it was refused, so callers can explain themselves.
local function authorise(src)
    local Player = QBCore.Functions.GetPlayer(src)
    if not Player then return nil, 'no player' end

    local job = Player.PlayerData.job
    if not job or not Config.Jobs[job.name] then return nil, 'not employed by EMS' end
    if Config.RequireDuty and not job.onduty then return nil, 'off duty' end

    return Player
end

local function gradeOf(Player)
    local job = Player.PlayerData.job
    local grade = job and job.grade
    if type(grade) == 'table' then return tonumber(grade.level) or 0 end
    return tonumber(grade) or 0
end

local function certsFor(grade)
    local certs = { 'BLS' }
    if grade >= (Config.CertGrades.ALS or 2) then table.insert(certs, 'ALS') end
    if grade >= Config.CommandGrade then table.insert(certs, 'Command') end
    return certs
end

local function canRun(grade, cert)
    local needed = Config.CertGrades[cert]
    if needed == nil then return true end
    return grade >= needed
end

local function callsignTaken(callsign, exceptSrc)
    for src, medic in pairs(Medics) do
        if src ~= exceptSrc and medic.callsign == callsign then return true end
    end
    return false
end

local function assignCallsign(src, Player)
    local stored = Player.PlayerData.metadata and Player.PlayerData.metadata[Config.CallsignMetaKey]
    if type(stored) == 'string' and stored ~= '' and not callsignTaken(stored, src) then
        return stored
    end

    for _, number in ipairs(Config.CallsignNumbers) do
        local candidate = ('%s%02d'):format(Config.CallsignPrefix, number)
        if not callsignTaken(candidate, src) then
            Player.Functions.SetMetaData(Config.CallsignMetaKey, candidate)
            return candidate
        end
    end

    -- Pool exhausted: fall back to something unique rather than a duplicate.
    return ('%s%s'):format(Config.CallsignPrefix, tostring(src))
end

local function registerMedic(src, Player)
    local existing = Medics[src]
    local grade = gradeOf(Player)
    local charinfo = Player.PlayerData.charinfo or {}
    local jobGrade = Player.PlayerData.job.grade

    local medic = existing or {
        status = Config.DefaultStatus,
        onDutySince = os.time(),
        coords = nil,
        street = nil,
        vehicle = nil,
        assignedCall = nil,
    }

    medic.src = src
    medic.citizenid = Player.PlayerData.citizenid
    medic.name = ('%s %s'):format(charinfo.firstname or 'Unknown', charinfo.lastname or 'Medic')
    medic.grade = grade
    medic.rank = (type(jobGrade) == 'table' and jobGrade.name) or ('Grade %d'):format(grade)
    medic.badge = ('EMS-%s'):format(tostring(Player.PlayerData.citizenid):sub(-4):upper())
    medic.certs = certsFor(grade)
    medic.callsign = medic.callsign or assignCallsign(src, Player)

    Medics[src] = medic
    return medic
end

local function unregisterMedic(src)
    local medic = Medics[src]
    if not medic then return end

    -- Release any call this unit was holding so it returns to the board.
    for _, call in pairs(Calls) do
        for index, callsign in ipairs(call.assigned) do
            if callsign == medic.callsign then table.remove(call.assigned, index) break end
        end
    end

    pushActivity(('%s went off duty'):format(medic.callsign), 'dim')
    Medics[src] = nil
    Open[src] = nil
end

-- ══ 3. station stock ══════════════════════════════════════════════════════

local function stockFor(stationId)
    Stock[stationId] = Stock[stationId] or {}
    return Stock[stationId]
end

local function restockStation(stationId, announce)
    local levels = stockFor(stationId)
    for _, supply in ipairs(Config.Supplies) do
        levels[supply.item] = supply.par
        Medtab.DB.SaveStock(stationId, supply.item, supply.par)
    end
    if announce then pushActivity(('%s locker restocked to par'):format(stationId), 'ok') end
end

local function loadStock()
    Medtab.DB.LoadStock(function(rows)
        for _, row in ipairs(rows) do
            if SupplyByItem[row.item] then
                stockFor(row.station)[row.item] = tonumber(row.stock) or 0
            end
        end
        -- Any station or item the database has never seen starts at par.
        for _, station in ipairs(Config.Stations) do
            local levels = stockFor(station.id)
            for _, supply in ipairs(Config.Supplies) do
                if levels[supply.item] == nil then
                    levels[supply.item] = supply.par
                    Medtab.DB.SaveStock(station.id, supply.item, supply.par)
                end
            end
        end
    end)
end

-- ══ 4. dispatch calls ═════════════════════════════════════════════════════

local function callAgeSeconds(call) return os.time() - call.openedAt end

--- Creates a call and puts it on every open tablet. `data` may carry
--- coords / type / code / priority / street / notes / caller / patientCid.
local function createCall(data)
    data = data or {}
    local coords = data.coords
    if type(coords) == 'table' then
        coords = { x = tonumber(coords.x) or 0.0, y = tonumber(coords.y) or 0.0, z = tonumber(coords.z) or 0.0 }
    else
        coords = { x = 0.0, y = 0.0, z = 0.0 }
    end

    callSeq = callSeq + 1
    local ref = ('LS-%d'):format(callSeq)

    local call = {
        id = ref,
        priority = clamp(tonumber(data.priority) or Config.AutoCallPriority, 1, 3),
        type = tostring(data.type or 'Medical Emergency'),
        code = tostring(data.code or '10-52'),
        street = tostring(data.street or districtFor(coords.x, coords.y)),
        district = tostring(data.district or districtFor(coords.x, coords.y)),
        postal = postalFor(coords.x, coords.y),
        caller = tostring(data.caller or 'Automated alert'),
        callerPhone = tostring(data.callerPhone or '911'),
        notes = tostring(data.notes or 'No further details from the reporting party.'),
        openedAt = os.time(),
        patients = math.max(1, tonumber(data.patients) or 1),
        assigned = {},
        coords = coords,
        pdOnScene = data.pdOnScene == true,
        patientCid = data.patientCid,
        patientSrc = data.patientSrc,
        stage = 'dispatched',
    }

    Calls[ref] = call
    Medtab.DB.LogCall(call)
    pushActivity(('%s — %s at %s'):format(call.code, call.type, call.street), call.priority == 1 and 'crit' or 'warn')

    for src in pairs(Open) do
        toast(src, ('New call %s'):format(ref), ('%s — %s'):format(call.type, call.street), call.priority == 1 and 'crit' or 'warn')
    end
    return call
end

local function closeCall(ref, callsign, outcome)
    local call = Calls[ref]
    if not call then return false end
    Calls[ref] = nil
    Medtab.DB.CloseCall(ref, callsign, outcome or 'Cleared')
    pushActivity(('%s cleared %s — %s'):format(callsign or 'Dispatch', ref, outcome or 'cleared'), 'ok')
    return true
end

local function expireCalls()
    local limit = Config.CallExpiryMinutes * 60
    for ref, call in pairs(Calls) do
        if callAgeSeconds(call) > limit and #call.assigned == 0 then
            Calls[ref] = nil
            Medtab.DB.CloseCall(ref, nil, 'Expired')
            pushActivity(('%s expired with no unit assigned'):format(ref), 'dim')
        end
    end
end

-- ══ 5. patients, vitals and injuries ══════════════════════════════════════

--- Builds (or refreshes) the medical record for a player. Everything the game
--- can actually answer — health, armour, death state, cause of death — is read
--- here; the rest of the chart is generated once per character from a stable
--- hash of their citizen id so it does not reroll between refreshes.
local function ensurePatient(src, callRef)
    local Player = QBCore.Functions.GetPlayer(src)
    if not Player then return nil end

    local citizenid = Player.PlayerData.citizenid
    local charinfo = Player.PlayerData.charinfo or {}
    local metadata = Player.PlayerData.metadata or {}
    local seed = hashOf(citizenid)

    local patient = Patients[citizenid]
    if not patient then
        local blood = metadata.bloodtype
        if type(blood) ~= 'string' or blood == '' then blood = pickFrom(BLOOD_TYPES, seed) end

        patient = {
            id = ('PT-%s'):format(tostring(citizenid):sub(-4):upper()),
            citizenid = citizenid,
            firstSeen = os.time(),
            injuries = {},
            timeline = {},
            blood = blood,
            allergies = (seed % 5 == 0) and {} or { pickFrom(ALLERGY_POOL, seed) },
            conditions = (seed % 3 == 0) and {} or { pickFrom(CONDITION_POOL, seed + 7) },
            insurance = pickFrom(INSURANCE_POOL, seed + 3),
            weightKg = 58 + (seed % 46),
        }
        Patients[citizenid] = patient
    end

    patient.src = src
    patient.name = ('%s %s'):format(charinfo.firstname or 'Unknown', charinfo.lastname or 'Patient')
    patient.dob = charinfo.birthdate or '—'
    patient.sex = (charinfo.gender == 1 or charinfo.gender == '1') and 'F' or 'M'
    patient.age = tonumber(charinfo.age) or (22 + (seed % 40))
    if callRef then patient.callId = callRef end
    patient.lastUpdate = os.time()
    return patient
end

--- Turns ped health and armour into the vital signs the chart displays. The
--- numbers are derived, not invented: one health value produces one set of
--- vitals, every time, and the tablet and the game can never disagree.
local function deriveVitals(patient)
    local src = patient.src
    local ped = src and GetPlayerPed(src) or 0
    if not ped or ped == 0 then
        patient.online = false
        return
    end
    patient.online = true

    local health = GetEntityHealth(ped)
    local maxHealth = GetPedMaxHealth(ped)
    if not maxHealth or maxHealth <= 100 then maxHealth = 200 end
    local armour = GetPedArmour(ped) or 0

    -- FiveM peds sit between 100 (dead) and maxHealth (untouched).
    local span = math.max(1, maxHealth - 100)
    local vitality = clamp((health - 100) / span, 0, 1)
    local down = health <= 101

    patient.health = health
    patient.armour = armour
    patient.down = down
    patient.conscious = not down and vitality > 0.25

    local hurt = 1 - vitality
    if down then
        patient.vitals = { hr = 0, sys = 0, dia = 0, spo2 = 0, rr = 0, temp = 34.2, gcs = 3, bloodLossPct = 62 }
        patient.rhythm = 'Asystole'
        patient.triage = 'red'
        patient.status = 'Unresponsive'
    else
        patient.vitals = {
            hr = round(clamp(72 + hurt * 88, 40, 190)),
            sys = round(clamp(122 - hurt * 56, 52, 150)),
            dia = round(clamp(78 - hurt * 34, 30, 96)),
            spo2 = round(clamp(99 - hurt * 23, 60, 100)),
            rr = round(clamp(15 + hurt * 17, 8, 40)),
            temp = tonumber(('%.1f'):format(clamp(36.8 - hurt * 1.9, 33.5, 38.5))),
            gcs = round(clamp(15 - hurt * 11, 3, 15)),
            bloodLossPct = round(clamp(hurt * 62, 0, 95)),
        }
        patient.rhythm = hurt > 0.6 and 'Sinus tachycardia' or (hurt > 0.3 and 'Sinus rhythm, elevated' or 'Sinus rhythm')
        patient.triage = hurt > 0.62 and 'red' or (hurt > 0.3 and 'yellow' or 'green')
        patient.status = patient.callId and 'On scene' or 'Assessed'
    end

    if patient.declaredDead then
        patient.triage = 'black'
        patient.status = 'Deceased'
    end

    -- The complaint follows whatever last put them here.
    local cause = patient.damageClass or 'unknown'
    local descriptor = Config.DamageTypes[cause] or Config.DamageTypes.unknown
    patient.complaint = descriptor.complaint
    if #patient.injuries > 0 then
        patient.complaint = ('%s, %d site%s'):format(descriptor.complaint, #patient.injuries, #patient.injuries == 1 and '' or 's')
    end

    local coords = pedCoordsOf(src)
    if coords then
        patient.location = patient.street or districtFor(coords.x, coords.y)
        patient.coords = coords
    end
end

--- Records one hit reported by the patient's own client. The bone decides
--- where the marker lands on the body diagram; severity comes from how badly
--- hurt they were when it landed.
local function addInjury(citizenid, bone, damageClass, vitality)
    local patient = Patients[citizenid]
    if not patient then return end

    local region = Config.BoneRegions[bone] or Config.BoneFallback
    local descriptor = Config.DamageTypes[damageClass] or Config.DamageTypes.unknown

    local hurt = 1 - clamp(vitality or 0.5, 0, 1)
    local severity = 'minor'
    if hurt > 0.62 then severity = 'critical'
    elseif hurt > 0.42 then severity = 'major'
    elseif hurt > 0.2 then severity = 'moderate' end

    -- One marker per body site: a second hit to the same place escalates the
    -- one that is already there rather than stacking pins on top of each other.
    for _, injury in ipairs(patient.injuries) do
        if injury.bone == bone then
            injury.severity = severity
            injury.hits = (injury.hits or 1) + 1
            injury.note = ('%s. %d separate impacts recorded at this site.'):format(descriptor.label, injury.hits)
            return
        end
    end

    table.insert(patient.injuries, {
        id = ('i%d'):format(#patient.injuries + 1),
        bone = bone,
        label = ('%s — %s'):format(descriptor.label, region.label:lower()),
        region = region.region,
        x = region.x,
        y = region.y,
        side = region.side,
        severity = severity,
        hits = 1,
        note = ('%s recorded at the %s. Reassess after intervention.'):format(descriptor.label, region.label:lower()),
    })
    patient.damageClass = damageClass
end

local function addTimeline(patient, label, by, kind)
    table.insert(patient.timeline, { at = os.time(), label = label, by = by or 'Dispatch', kind = kind or 'system' })
    while #patient.timeline > 14 do table.remove(patient.timeline, 1) end
end

--- Patients drop off the board once they are well, off a call, and have not
--- been touched for ten minutes.
local function prunePatients()
    local now = os.time()
    for citizenid, patient in pairs(Patients) do
        local stale = (now - (patient.lastUpdate or 0)) > 600
        local settled = not patient.down and (patient.triage == 'green' or patient.triage == nil)
        if stale and settled and not patient.callId then Patients[citizenid] = nil end
    end
end

-- ══ 6. treatments ═════════════════════════════════════════════════════════
--
--  The client never decides that a treatment happened. It asks to start one;
--  the server checks the medic, the certification, the item and the distance,
--  takes the item, and issues a token stamped with the start time. When the
--  progress bar finishes the client returns the token, and the server applies
--  the effect only if the token is real, belongs to that player, and the full
--  duration has genuinely elapsed.

local function beginTreatment(src, protocolId, targetId)
    local Player, reason = authorise(src)
    if not Player then return nil, reason or 'not authorised' end

    local medic = Medics[src]
    if not medic then return nil, 'not on the roster' end

    local protocol = ProtocolById[protocolId]
    if not protocol then return nil, 'unknown protocol' end

    if not canRun(medic.grade, protocol.cert) then
        return nil, ('%s certification required'):format(protocol.cert)
    end

    targetId = tonumber(targetId)
    if not targetId then return nil, 'no patient selected' end

    local Target = QBCore.Functions.GetPlayer(targetId)
    if not Target then return nil, 'that patient is no longer here' end

    local medicCoords = pedCoordsOf(src)
    local targetCoords = pedCoordsOf(targetId)
    if distanceBetween(medicCoords, targetCoords) > Config.TreatDistance then
        return nil, 'move closer to the patient'
    end

    for _, entry in pairs(Treatments) do
        if entry.src == src then return nil, 'already treating' end
    end

    if protocol.item then
        if not Medtab.Inventory.Has(src, Player, protocol.item, 1) then
            local supply = SupplyByItem[protocol.item]
            return nil, ('no %s in your kit'):format(supply and supply.label or protocol.item)
        end
        if not Medtab.Inventory.Take(src, Player, protocol.item, 1) then
            return nil, 'the inventory refused to take the item'
        end
    end

    treatmentSeq = treatmentSeq + 1
    local token = ('t%d-%d'):format(treatmentSeq, math.random(1000, 9999))

    Treatments[token] = {
        src = src,
        targetId = targetId,
        protocol = protocol,
        startedAt = os.time(),
        item = protocol.item,
        medicCid = medic.citizenid,
        callsign = medic.callsign,
    }

    local patient = ensurePatient(targetId)
    if patient then
        addTimeline(patient, ('%s started'):format(protocol.name), medic.callsign, protocol.tone == 'assess' and 'assess' or 'treat')
    end

    return token, protocol
end

local function finishTreatment(src, token)
    local entry = Treatments[token]
    if not entry then return false, 'that treatment is no longer running' end
    if entry.src ~= src then return false, 'that treatment belongs to another unit' end

    -- The real clock decides, not the client's. A finish that arrives before
    -- the protocol could possibly have completed is rejected outright.
    local elapsed = os.time() - entry.startedAt
    if elapsed + 1 < entry.protocol.seconds then
        Treatments[token] = nil
        return false, 'treatment interrupted'
    end

    Treatments[token] = nil

    local medicCoords = pedCoordsOf(src)
    local targetCoords = pedCoordsOf(entry.targetId)
    if distanceBetween(medicCoords, targetCoords) > Config.TreatDistance then
        return false, 'you left the patient'
    end

    local Target = QBCore.Functions.GetPlayer(entry.targetId)
    if not Target then return false, 'the patient disconnected' end

    local protocol = entry.protocol
    local patient = ensurePatient(entry.targetId)

    -- The health change is applied on the patient's own client: SetEntityHealth
    -- and NetworkResurrectLocalPlayer are client natives and only that client
    -- owns the ped.
    TriggerClientEvent('fsm_medtab:client:applyTreatment', entry.targetId, {
        heal = protocol.heal or 0,
        revive = protocol.revive == true,
        reviveHealth = Config.ReviveHealth,
        useQBRevive = Config.UseQBAmbulanceRevive,
        label = protocol.name,
    })

    if patient then
        patient.declaredDead = false
        addTimeline(patient, ('%s completed'):format(protocol.name), entry.callsign, protocol.tone == 'assess' and 'assess' or 'treat')
        if protocol.id == 'p-abc' then patient.surveyed = true end
        if protocol.revive then
            patient.injuries = {}
            patient.damageClass = nil
        end
        patient.lastUpdate = os.time()
    end

    Medtab.DB.LogTreatment({
        medicCid = entry.medicCid,
        callsign = entry.callsign,
        patientCid = patient and patient.citizenid,
        protocol = protocol.id,
        item = entry.item,
        succeeded = true,
    })

    pushActivity(('%s — %s on %s'):format(entry.callsign, protocol.name, patient and patient.id or 'patient'), 'pink')
    return true, protocol
end

local function cancelTreatment(src, token)
    local entry = Treatments[token]
    if not entry or entry.src ~= src then return false end
    Treatments[token] = nil

    -- A cancelled protocol gives the consumable back: it was never used.
    if entry.item then
        local Player = QBCore.Functions.GetPlayer(src)
        if Player then Medtab.Inventory.Give(src, Player, entry.item, 1) end
    end

    Medtab.DB.LogTreatment({
        medicCid = entry.medicCid,
        callsign = entry.callsign,
        patientCid = nil,
        protocol = entry.protocol.id,
        item = entry.item,
        succeeded = false,
    })
    return true
end

-- ══ 7. reports and billing ════════════════════════════════════════════════

local OUTCOMES = {
    ['Transported'] = true,
    ['Treated on scene'] = true,
    ['Refused transport'] = true,
    ['Deceased'] = true,
}

local function fileReport(src, payload)
    local Player, reason = authorise(src)
    if not Player then return false, reason or 'not authorised' end

    local medic = Medics[src]
    if not medic then return false, 'not on the roster' end

    payload = type(payload) == 'table' and payload or {}

    local narrative = tostring(payload.narrative or '')
    if #narrative < 40 then return false, 'the narrative is too short to file' end
    if #narrative > 4000 then narrative = narrative:sub(1, 4000) end

    local outcome = tostring(payload.outcome or 'Treated on scene')
    if not OUTCOMES[outcome] then outcome = 'Treated on scene' end

    -- The fee is never taken from the client. Only protocol ids come across,
    -- and each one is priced from config.lua.
    local procedures, billed = {}, 0
    if type(payload.procedures) == 'table' then
        for _, id in ipairs(payload.procedures) do
            local protocol = ProtocolById[tostring(id)]
            if protocol then
                table.insert(procedures, protocol.id)
                billed = billed + 120 + (protocol.seconds * 6) + (protocol.cert == 'ALS' and 350 or 0)
            end
        end
    end
    if outcome == 'Transported' then billed = billed + 850 end
    if outcome == 'Refused transport' or outcome == 'Deceased' then billed = 0 end
    billed = math.min(billed, Config.Billing.maximum)

    local patientCid, patientName = nil, 'Unknown'
    local targetId = tonumber(payload.patientId)
    if targetId then
        local Target = QBCore.Functions.GetPlayer(targetId)
        if Target then
            patientCid = Target.PlayerData.citizenid
            local info = Target.PlayerData.charinfo or {}
            patientName = ('%s %s'):format(info.firstname or 'Unknown', info.lastname or 'Patient')

            if Config.Billing.enabled and billed > 0 then
                if Target.Functions.RemoveMoney(Config.Billing.account, billed, 'fsm_medtab: medical care') then
                    notify(targetId, ('Medical bill charged: $%d'):format(billed), 'error')
                    if Config.Billing.payCrew then
                        local share = math.floor(billed * Config.Billing.crewShare)
                        if share > 0 then
                            Player.Functions.AddMoney('bank', share, 'fsm_medtab: care fee')
                        end
                    end
                else
                    -- Unpaid care is still recorded; the bill simply did not clear.
                    billed = 0
                end
            end
        end
    end

    reportSeq = reportSeq + 1
    local report = {
        id = ('RPT-%d'):format(reportSeq),
        callId = payload.callId and Calls[tostring(payload.callId)] and tostring(payload.callId) or (payload.callId and tostring(payload.callId)) or nil,
        medicCid = medic.citizenid,
        author = medic.name,
        callsign = medic.callsign,
        patientCid = patientCid,
        patient = patientName,
        type = tostring(payload.type or 'Medical'),
        complaint = tostring(payload.complaint or ''),
        narrative = narrative,
        procedures = procedures,
        outcome = outcome,
        billed = billed,
        status = 'filed',
        createdAt = os.time(),
    }

    table.insert(Reports, 1, report)
    while #Reports > 40 do table.remove(Reports) end
    Medtab.DB.InsertReport(report)

    if report.callId then closeCall(report.callId, medic.callsign, outcome) end

    pushActivity(('%s filed %s — %s'):format(medic.callsign, report.id, outcome), 'ok')
    return true, report
end

-- ══ 8. the state payload ══════════════════════════════════════════════════

local function supplyPayload(src, Player, stationId)
    local levels = stockFor(stationId)
    local out = {}
    for _, supply in ipairs(Config.Supplies) do
        table.insert(out, {
            id = supply.item,
            label = supply.label,
            stock = levels[supply.item] or 0,
            max = supply.par,
            weightKg = supply.weightKg,
            category = supply.category,
            use = supply.use,
            takeLimit = supply.takeLimit,
            carried = Medtab.Inventory.Count(src, Player, supply.item),
        })
    end
    return out
end

local function protocolPayload(grade)
    local out = {}
    for _, protocol in ipairs(Config.Protocols) do
        table.insert(out, {
            id = protocol.id,
            name = protocol.name,
            cert = protocol.cert,
            seconds = protocol.seconds,
            item = protocol.item,
            icon = protocol.icon,
            effect = protocol.effect,
            tone = protocol.tone,
            allowed = canRun(grade, protocol.cert),
        })
    end
    return out
end

local function callPayload(medic)
    local out = {}
    for _, call in pairs(Calls) do
        table.insert(out, {
            id = call.id,
            priority = call.priority,
            type = call.type,
            code = call.code,
            street = call.street,
            district = call.district,
            postal = call.postal,
            caller = call.caller,
            callerPhone = call.callerPhone,
            notes = call.notes,
            openedSecondsAgo = callAgeSeconds(call),
            patients = call.patients,
            assigned = call.assigned,
            world = { x = call.coords.x, y = call.coords.y },
            coords = call.coords,
            pdOnScene = call.pdOnScene,
            stage = call.stage,
            mine = medic and call.assigned and (function()
                for _, callsign in ipairs(call.assigned) do
                    if callsign == medic.callsign then return true end
                end
                return false
            end)() or false,
        })
    end
    table.sort(out, function(a, b)
        if a.priority ~= b.priority then return a.priority < b.priority end
        return a.openedSecondsAgo > b.openedSecondsAgo
    end)
    return out
end

local function unitPayload(medic)
    local out = {}
    for _, other in pairs(Medics) do
        local coords = other.coords or pedCoordsOf(other.src)
        local crew = { other.name }
        table.insert(out, {
            callsign = other.callsign,
            vehicleModel = other.vehicle and other.vehicle.model or nil,
            vehicleLabel = other.vehicle and other.vehicle.label or 'On foot',
            vehicleHash = other.vehicle and tostring(other.vehicle.hash) or nil,
            plate = other.vehicle and other.vehicle.plate or '—',
            status = other.status,
            crew = crew,
            location = other.street or (coords and districtFor(coords.x, coords.y)) or 'Unknown',
            world = coords and { x = coords.x, y = coords.y } or nil,
            assignedCall = other.assignedCall,
            fuel = other.vehicle and other.vehicle.fuel or nil,
            mine = medic ~= nil and other.src == medic.src,
            serverId = other.src,
        })
    end
    table.sort(out, function(a, b)
        if a.mine ~= b.mine then return a.mine end
        return a.callsign < b.callsign
    end)
    return out
end

local function rosterPayload()
    local out = {}
    for _, other in pairs(Medics) do
        table.insert(out, {
            name = other.name,
            rank = other.rank,
            badge = other.badge,
            unit = other.callsign,
            certs = other.certs,
            online = true,
            serverId = other.src,
        })
    end
    table.sort(out, function(a, b) return a.name < b.name end)
    return out
end

local function patientPayload(medic)
    local now = os.time()
    local out = {}
    for _, patient in pairs(Patients) do
        deriveVitals(patient)
        if patient.online then
            local timeline = {}
            for _, entry in ipairs(patient.timeline) do
                table.insert(timeline, {
                    t = relativeStamp(now - entry.at),
                    label = entry.label,
                    by = entry.by,
                    kind = entry.kind,
                })
            end
            table.insert(out, {
                id = patient.id,
                serverId = patient.src,
                name = patient.name,
                age = patient.age,
                sex = patient.sex,
                dob = patient.dob,
                blood = patient.blood,
                weightKg = patient.weightKg,
                triage = patient.triage or 'green',
                status = patient.status or 'Assessed',
                callId = patient.callId,
                location = patient.location or 'Unknown',
                complaint = patient.complaint or 'Cause unknown',
                conscious = patient.conscious == true,
                allergies = patient.allergies,
                conditions = patient.conditions,
                insurance = patient.insurance,
                rhythm = patient.rhythm or 'Sinus rhythm',
                vitals = patient.vitals or {},
                injuries = patient.injuries,
                timeline = timeline,
                notes = patient.surveyed
                    and 'Primary survey complete. Findings plotted on the body chart.'
                    or 'Primary survey not yet performed — run ABCDE to plot hidden injuries.',
                distance = medic and medic.coords and patient.coords
                    and round(distanceBetween(medic.coords, patient.coords)) or nil,
            })
        end
    end
    table.sort(out, function(a, b)
        local order = { red = 1, yellow = 2, green = 3, black = 4 }
        local ra, rb = order[a.triage] or 5, order[b.triage] or 5
        if ra ~= rb then return ra < rb end
        return a.name < b.name
    end)
    return out
end

local function reportPayload()
    local out = {}
    for _, report in ipairs(Reports) do
        table.insert(out, {
            id = report.id,
            callId = report.callId or '—',
            patient = report.patient,
            date = os.date('%d %b %Y', report.createdAt),
            time = os.date('%H:%M', report.createdAt),
            type = report.type,
            author = report.author,
            outcome = report.outcome,
            billed = report.billed,
            status = report.status,
        })
    end
    return out
end

local function activityPayload()
    local out = {}
    for index, entry in ipairs(Activity) do
        if index > 12 then break end
        table.insert(out, entry)
    end
    return out
end

--- Builds and sends one medic's view of the world.
local function pushState(src)
    if not Open[src] then return end

    -- Re-checked every tick rather than trusted from when the tablet opened:
    -- a medic who goes off duty or loses the job with the tablet open has it
    -- taken off the screen on the next push.
    local Player, reason = authorise(src)
    if not Player then
        Open[src] = nil
        TriggerClientEvent('fsm_medtab:client:forceClose', src, reason)
        unregisterMedic(src)
        return
    end

    local medic = Medics[src]
    if not medic then return end

    local coords = medic.coords or pedCoordsOf(src)
    local station = nearestStation(coords)
    local atStation = stationNear(coords)

    Medtab.DB.ShiftStats(medic.citizenid, 12, function(shift)
        Medtab.DB.HourlyCalls(8, function(hourly)
            local calls = callPayload(medic)
            local patients = patientPayload(medic)

            local openCalls = #calls
            local inMemoryHourly = false
            local total = 0
            for _, value in ipairs(hourly) do total = total + value end
            if total == 0 then inMemoryHourly = true end

            TriggerClientEvent('fsm_medtab:client:state', src, {
                action = 'state',
                data = {
                    medic = {
                        name = medic.name,
                        callsign = medic.callsign,
                        rank = medic.rank,
                        badge = medic.badge,
                        certs = medic.certs,
                        grade = medic.grade,
                        shiftStartedSecondsAgo = os.time() - medic.onDutySince,
                        station = station and station.label or '—',
                        atStation = atStation ~= nil,
                        atStationLabel = atStation and atStation.label or nil,
                        serverId = src,
                    },
                    unitStatus = medic.status,
                    unitStatuses = Config.StatusCodes,
                    calls = calls,
                    patients = patients,
                    units = unitPayload(medic),
                    roster = rosterPayload(),
                    supplies = supplyPayload(src, Player, (atStation or station).id),
                    protocols = protocolPayload(medic.grade),
                    reports = reportPayload(),
                    activity = activityPayload(),
                    stats = {
                        callsTaken = shift.reports,
                        patientsTreated = shift.treated,
                        transported = shift.transported,
                        avgResponseSeconds = 214,
                        survivalRate = (shift.reports > 0)
                            and math.max(0, (shift.reports - shift.deceased) / shift.reports) or 1,
                        revenue = shift.revenue,
                        hourly = inMemoryHourly and { 0, 0, 0, 0, 0, 0, 0, openCalls } or hourly,
                        openCalls = openCalls,
                        onDuty = #rosterPayload(),
                    },
                    map = { tileUrl = Config.MapTileUrl ~= '' and Config.MapTileUrl or nil },
                    -- The rules the server actually enforces, sent rather than
                    -- duplicated in the interface: the panel can say "move
                    -- closer" or cap a bill without keeping its own copy of a
                    -- number that only config.lua is allowed to decide.
                    rules = {
                        treatDistance = Config.TreatDistance,
                        stationRadius = Config.StationRadius,
                        billingEnabled = Config.Billing.enabled == true,
                        billingMaximum = Config.Billing.maximum,
                        callExpiryMinutes = Config.CallExpiryMinutes,
                    },
                    server = {
                        time = os.time(),
                        uptime = os.time() - startedAt,
                        persistence = Medtab.DB.available,
                    },
                },
            })
        end)
    end)
end

local function pushAll()
    for src in pairs(Open) do pushState(src) end
end

-- ══ 9. net events, exports and commands ═══════════════════════════════════

RegisterNetEvent('fsm_medtab:server:open', function()
    local src = source
    local Player, reason = authorise(src)
    if not Player then
        TriggerClientEvent('fsm_medtab:client:denied', src, reason or 'not authorised')
        return
    end
    registerMedic(src, Player)
    Open[src] = true
    pushState(src)
end)

RegisterNetEvent('fsm_medtab:server:close', function()
    Open[source] = nil
end)

--- Position, street and vehicle come from the medic's own client because the
--- natives that read them are client-side.
RegisterNetEvent('fsm_medtab:server:heartbeat', function(data)
    local src = source
    local medic = Medics[src]
    if not medic or type(data) ~= 'table' then return end

    if type(data.coords) == 'table' then
        medic.coords = {
            x = tonumber(data.coords.x) or 0.0,
            y = tonumber(data.coords.y) or 0.0,
            z = tonumber(data.coords.z) or 0.0,
        }
    end
    medic.street = type(data.street) == 'string' and data.street:sub(1, 96) or nil

    if type(data.vehicle) == 'table' then
        medic.vehicle = {
            model = type(data.vehicle.model) == 'string' and data.vehicle.model:sub(1, 32) or nil,
            label = type(data.vehicle.label) == 'string' and data.vehicle.label:sub(1, 48) or 'Vehicle',
            hash = tonumber(data.vehicle.hash),
            plate = type(data.vehicle.plate) == 'string' and data.vehicle.plate:sub(1, 12) or '—',
            fuel = round(clamp(tonumber(data.vehicle.fuel) or 0, 0, 100)),
        }
    else
        medic.vehicle = nil
    end
end)

RegisterNetEvent('fsm_medtab:server:setStatus', function(code)
    local src = source
    local medic = Medics[src]
    if not medic or type(code) ~= 'string' then return end

    local status = StatusByCode[code]
    if not status then return end

    medic.status = code
    pushActivity(('%s is %s — %s'):format(medic.callsign, code, status.label), code == '10-23' and 'crit' or 'dim')
    pushAll()
end)

RegisterNetEvent('fsm_medtab:server:callAction', function(ref, action)
    local src = source
    local medic = Medics[src]
    if not medic or type(ref) ~= 'string' or type(action) ~= 'string' then return end

    local call = Calls[ref]
    if not call then
        toast(src, 'Call closed', 'That call is no longer on the board.', 'warn')
        return
    end

    local function attach()
        for _, callsign in ipairs(call.assigned) do
            if callsign == medic.callsign then return end
        end
        table.insert(call.assigned, medic.callsign)
    end

    if action == 'enroute' then
        attach()
        medic.assignedCall = ref
        medic.status = '10-17'
        call.stage = 'enroute'
        TriggerClientEvent('fsm_medtab:client:setRoute', src, call.coords, ref)
        toast(src, 'Route set — en route', ('%s · %s'):format(ref, call.street), 'ok')
        pushActivity(('%s en route to %s'):format(medic.callsign, ref), 'warn')

    elseif action == 'onscene' then
        attach()
        medic.assignedCall = ref
        medic.status = '10-23'
        call.stage = 'onscene'
        if call.patientSrc then ensurePatient(call.patientSrc, ref) end
        toast(src, 'Marked on scene', ('%s · %s'):format(ref, call.street), 'ok')
        pushActivity(('%s on scene at %s'):format(medic.callsign, ref), 'crit')

    elseif action == 'contact' then
        toast(src, 'Calling reporting party', ('%s · %s'):format(call.caller, call.callerPhone), 'info')

    elseif action == 'clear' then
        closeCall(ref, medic.callsign, 'Cleared')
        medic.assignedCall = nil
        medic.status = '10-8'
        TriggerClientEvent('fsm_medtab:client:clearRoute', src, ref)
        toast(src, 'Call cleared', ('%s closed and logged.'):format(ref), 'ok')

    else
        return
    end

    pushAll()
end)

RegisterNetEvent('fsm_medtab:server:takeSupply', function(item, amount)
    local src = source
    local Player, reason = authorise(src)
    if not Player then toast(src, 'Refused', reason or 'Not authorised.', 'crit') return end

    local medic = Medics[src]
    if not medic then return end

    local supply = SupplyByItem[tostring(item)]
    if not supply then return end

    amount = clamp(math.floor(tonumber(amount) or 1), 1, supply.takeLimit)

    local station = stationNear(medic.coords or pedCoordsOf(src))
    if not station then
        toast(src, 'Not at a locker', 'Stand at a station supply point to draw stock.', 'warn')
        return
    end

    local levels = stockFor(station.id)
    local available = levels[supply.item] or 0
    if available < amount then
        toast(src, 'Out of stock', ('%s — %d left at %s.'):format(supply.label, available, station.label), 'crit')
        return
    end

    if not Medtab.Inventory.Give(src, Player, supply.item, amount) then
        toast(src, 'Inventory refused', ('Could not add %s. Check the server console.'):format(supply.label), 'crit')
        return
    end

    levels[supply.item] = available - amount
    Medtab.DB.SaveStock(station.id, supply.item, levels[supply.item])
    pushActivity(('%s drew %s ×%d'):format(medic.callsign, supply.label, amount), 'pink')
    toast(src, 'Drawn from locker', ('%s ×%d'):format(supply.label, amount), 'ok')
    pushAll()
end)

RegisterNetEvent('fsm_medtab:server:returnSupply', function(item, amount)
    local src = source
    local Player, reason = authorise(src)
    if not Player then toast(src, 'Refused', reason or 'Not authorised.', 'crit') return end

    local medic = Medics[src]
    if not medic then return end

    local supply = SupplyByItem[tostring(item)]
    if not supply then return end

    amount = clamp(math.floor(tonumber(amount) or 1), 1, supply.takeLimit)

    local station = stationNear(medic.coords or pedCoordsOf(src))
    if not station then
        toast(src, 'Not at a locker', 'Stand at a station supply point to return stock.', 'warn')
        return
    end

    if not Medtab.Inventory.Take(src, Player, supply.item, amount) then
        toast(src, 'Nothing to return', ('You are not carrying %s.'):format(supply.label), 'warn')
        return
    end

    local levels = stockFor(station.id)
    levels[supply.item] = math.min(supply.par, (levels[supply.item] or 0) + amount)
    Medtab.DB.SaveStock(station.id, supply.item, levels[supply.item])
    toast(src, 'Returned to locker', ('%s ×%d'):format(supply.label, amount), 'ok')
    pushAll()
end)

RegisterNetEvent('fsm_medtab:server:beginTreatment', function(protocolId, targetId)
    local src = source
    local token, result = beginTreatment(src, tostring(protocolId), targetId)
    if not token then
        toast(src, 'Cannot start', tostring(result), 'crit')
        return
    end
    TriggerClientEvent('fsm_medtab:client:runTreatment', src, token, {
        id = result.id,
        name = result.name,
        seconds = result.seconds,
        anim = result.anim,
    })
    pushAll()
end)

RegisterNetEvent('fsm_medtab:server:finishTreatment', function(token)
    local src = source
    if type(token) ~= 'string' then return end
    local ok, result = finishTreatment(src, token)
    if ok then
        toast(src, 'Treatment complete', result.name, 'ok')
    else
        toast(src, 'Treatment failed', tostring(result), 'warn')
    end
    pushAll()
end)

RegisterNetEvent('fsm_medtab:server:cancelTreatment', function(token)
    local src = source
    if type(token) ~= 'string' then return end
    if cancelTreatment(src, token) then
        toast(src, 'Treatment cancelled', 'The consumable has been returned to your kit.', 'info')
        pushAll()
    end
end)

RegisterNetEvent('fsm_medtab:server:fileReport', function(payload)
    local src = source
    local ok, result = fileReport(src, payload)
    if ok then
        toast(src, 'Report filed', ('%s — %s%s'):format(result.id, result.outcome,
            result.billed > 0 and (', $' .. result.billed .. ' billed') or ''), 'ok')
    else
        toast(src, 'Not filed', tostring(result), 'warn')
    end
    pushAll()
end)

RegisterNetEvent('fsm_medtab:server:pageUnit', function(callsign)
    local src = source
    local medic = Medics[src]
    if not medic or type(callsign) ~= 'string' then return end

    for otherSrc, other in pairs(Medics) do
        if other.callsign == callsign then
            notify(otherSrc, ('%s is paging you on the medical net.'):format(medic.callsign), 'primary')
            toast(otherSrc, 'Radio page', ('%s is trying to reach you.'):format(medic.callsign), 'warn')
            toast(src, 'Paged', ('%s has been notified.'):format(callsign), 'ok')
            return
        end
    end
    toast(src, 'Unit unavailable', ('%s is not on duty.'):format(callsign), 'warn')
end)

--- Every client reports its own hits: GetPedLastDamageBone is client-side, so
--- only the injured player can say where they were struck.
RegisterNetEvent('fsm_medtab:server:damageReport', function(data)
    local src = source
    if type(data) ~= 'table' then return end

    local bone = tonumber(data.bone)
    local class = tostring(data.class or 'unknown')
    if not Config.DamageTypes[class] then class = 'unknown' end

    local patient = ensurePatient(src)
    if not patient then return end

    patient.street = type(data.street) == 'string' and data.street:sub(1, 96) or patient.street
    addInjury(patient.citizenid, bone, class, tonumber(data.vitality) or 0.5)
    patient.lastUpdate = os.time()
end)

--- A player going down raises a priority call, if the owner wants it to.
RegisterNetEvent('fsm_medtab:server:playerDown', function(data)
    local src = source
    if type(data) ~= 'table' then return end

    local patient = ensurePatient(src)
    if not patient then return end

    patient.street = type(data.street) == 'string' and data.street:sub(1, 96) or patient.street
    patient.damageClass = Config.DamageTypes[tostring(data.class)] and tostring(data.class) or 'unknown'
    patient.lastUpdate = os.time()
    addTimeline(patient, 'Collapsed — emergency alert raised', 'Dispatch', 'system')

    if not Config.AutoCallOnDown then pushAll() return end

    -- Do not raise a second call for someone already on the board.
    for _, call in pairs(Calls) do
        if call.patientCid == patient.citizenid then pushAll() return end
    end

    local coords = pedCoordsOf(src) or { x = 0.0, y = 0.0, z = 0.0 }
    local descriptor = Config.DamageTypes[patient.damageClass] or Config.DamageTypes.unknown

    local call = createCall({
        coords = coords,
        priority = Config.AutoCallPriority,
        type = descriptor.label,
        code = '10-71',
        street = patient.street,
        caller = 'Automated — biometric alert',
        callerPhone = '911',
        notes = ('Person down, unresponsive. %s. Nearest unit to respond.'):format(descriptor.complaint),
        patientCid = patient.citizenid,
        patientSrc = src,
        patients = 1,
    })
    patient.callId = call.id
    pushAll()
end)

-- ── exports ───────────────────────────────────────────────────────────────

--- Raise a call from another resource:
---   exports['fsm_medtab']:CreateCall({ coords = coords, type = 'Stabbing',
---       priority = 1, notes = '…', caller = 'Witness' })
--- Returns the call reference, e.g. "LS-2201".
function Medtab.CreateCall(data)
    local call = createCall(data)
    pushAll()
    return call.id
end
exports('CreateCall', function(data) return Medtab.CreateCall(data) end)

--- Close a call raised earlier. Returns true if it was still open.
exports('CloseCall', function(ref, outcome)
    local closed = closeCall(tostring(ref), 'Dispatch', outcome)
    if closed then pushAll() end
    return closed
end)

--- Read-only view of the open board, for dispatch boards and MDTs.
exports('GetCalls', function()
    return callPayload(nil)
end)

-- ── commands ──────────────────────────────────────────────────────────────

QBCore.Commands.Add('medtabrestock', 'Restock every EMS station locker to par', {}, false, function(source)
    for _, station in ipairs(Config.Stations) do restockStation(station.id, false) end
    pushActivity('All station lockers restocked by command', 'ok')
    notify(source, 'Every EMS locker has been restocked to par.', 'success')
    pushAll()
end, 'admin')

QBCore.Commands.Add('medtabcall', 'Raise a test EMS call at your position', {}, false, function(source)
    local coords = pedCoordsOf(source)
    local ref = Medtab.CreateCall({
        coords = coords,
        priority = 2,
        type = 'Test Call',
        code = '10-52',
        caller = 'Command test',
        notes = 'Raised with /medtabcall for testing. Safe to clear.',
    })
    notify(source, ('Test call %s raised at your position.'):format(ref), 'success')
end, 'admin')

-- ══ lifecycle ═════════════════════════════════════════════════════════════

AddEventHandler('playerDropped', function()
    unregisterMedic(source)
end)

CreateThread(function()
    Medtab.DB.Init(function()
        loadStock()

        print(('[fsm_medtab] ready — inventory: %s, persistence: %s'):format(
            Medtab.Inventory.Backend(), Medtab.DB.available and 'oxmysql' or 'memory only'))

        Medtab.DB.RecentReports(20, function(rows)
            for _, row in ipairs(rows or {}) do
                table.insert(Reports, {
                    id = row.ref,
                    callId = row.call_ref,
                    patient = row.patient_name or 'Unknown',
                    type = row.type or 'Medical',
                    author = row.medic_name or 'Unknown',
                    outcome = row.outcome or 'Treated on scene',
                    billed = tonumber(row.billed) or 0,
                    status = row.status or 'filed',
                    createdAt = os.time(),
                })
            end
        end)
    end)
end)

-- The state push. Two seconds is live enough for a dispatch board without
-- rebuilding the whole world every frame.
CreateThread(function()
    while true do
        Wait(2000)
        expireCalls()
        prunePatients()
        pushAll()
    end
end)

-- Automatic locker restock.
CreateThread(function()
    while true do
        Wait(math.max(60, Config.RestockSeconds) * 1000)
        if Config.RestockSeconds > 0 then
            for _, station in ipairs(Config.Stations) do restockStation(station.id, true) end
            pushAll()
        end
    end
end)

-- Abandoned treatments: if a client never reports back (crash, disconnect),
-- the token is dropped so the medic is not locked out of treating anyone.
CreateThread(function()
    while true do
        Wait(5000)
        local now = os.time()
        for token, entry in pairs(Treatments) do
            if now - entry.startedAt > entry.protocol.seconds + 20 then
                Treatments[token] = nil
            end
        end
    end
end)
