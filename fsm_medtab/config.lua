--[[
    fsm_medtab — EMS Medical Tablet
    Shared configuration (loads on the client AND the server).

    Everything a server owner needs to retune lives here. Nothing in this file
    is read directly by the NUI: the server sends the values the interface is
    allowed to know inside the state payload, so a rule has exactly one home
    and the tablet can never promise a price, a stock level or a cooldown the
    server does not actually enforce.
]]

Config = {}

-- ─────────────────────────────────────────────────────────────────────────
--  OPENING THE TABLET
-- ─────────────────────────────────────────────────────────────────────────

-- Chat command that toggles the tablet. Also the command RegisterKeyMapping
-- binds to, so renaming it here renames both.
Config.Command = 'medtab'

-- Register a rebindable key for the command (FiveM > Settings > Key Bindings).
-- Set to false if you would rather bind the command yourself.
Config.OpenWithKeybind = true

-- Default key for that binding. A player can change it in the pause menu;
-- this only sets what it starts as. Must be a FiveM key name, e.g. 'F6'.
Config.Keybind = 'F6'

-- Label shown next to the binding in the FiveM key-binding menu.
Config.KeyMappingLabel = 'Open EMS medical tablet'

-- ─────────────────────────────────────────────────────────────────────────
--  WHO MAY USE IT
-- ─────────────────────────────────────────────────────────────────────────

-- Job names allowed to open the tablet. These must match the job names in
-- your qb-core/shared/jobs.lua exactly.
Config.Jobs = {
    ['ambulance'] = true,
}

-- Require the player to be ON DUTY (QBCore's job.onduty flag) as well as
-- employed. Set to false if your server does not use the duty toggle.
Config.RequireDuty = true

-- Job grade needed for each certification level. A protocol marked 'ALS'
-- below is refused for anyone under the ALS grade — the server checks this,
-- the tablet only greys the button out.
Config.CertGrades = {
    BLS = 0, -- every EMS employee
    ALS = 2, -- paramedic and above
}

-- Grade from which the tablet shows command tools (full roster, all reports).
Config.CommandGrade = 3

-- ─────────────────────────────────────────────────────────────────────────
--  CALLSIGNS
-- ─────────────────────────────────────────────────────────────────────────

-- A medic's callsign is stored in QBCore metadata under this key, so it
-- survives a reconnect. The first free number from the pool is handed out
-- when someone goes on duty without one.
Config.CallsignMetaKey = 'medtab_callsign'
Config.CallsignPrefix = 'MEDIC-'
Config.CallsignNumbers = { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 }

-- Radio 10-codes. `tone` drives the colour in the interface.
Config.StatusCodes = {
    { code = '10-8',  label = 'Available',     tone = 'ok'   },
    { code = '10-7',  label = 'Out of service', tone = 'dim'  },
    { code = '10-17', label = 'En route',      tone = 'warn' },
    { code = '10-23', label = 'On scene',      tone = 'crit' },
    { code = '10-19', label = 'Returning',     tone = 'warn' },
}

Config.DefaultStatus = '10-8'

-- ─────────────────────────────────────────────────────────────────────────
--  STATIONS
-- ─────────────────────────────────────────────────────────────────────────

-- Supplies can only be drawn from the locker while standing at a station.
-- `supply` is the locker position; `blip` is optional (set to false for none).
Config.Stations = {
    {
        id = 'pillbox',
        label = 'Pillbox Hill Medical Center',
        supply = vector3(310.2, -601.3, 43.28),
        blip = { sprite = 61, colour = 1, scale = 0.7 },
    },
    {
        id = 'sandy',
        label = 'Sandy Shores Medical',
        supply = vector3(1832.9, 3672.9, 34.28),
        blip = { sprite = 61, colour = 1, scale = 0.7 },
    },
    {
        id = 'paleto',
        label = 'Paleto Bay Care Center',
        supply = vector3(-247.2, 6331.2, 32.43),
        blip = { sprite = 61, colour = 1, scale = 0.7 },
    },
}

-- How close (metres) the medic must stand to a locker to draw supplies.
Config.StationRadius = 6.0

-- ─────────────────────────────────────────────────────────────────────────
--  SUPPLIES
-- ─────────────────────────────────────────────────────────────────────────
--
--  `item` MUST exist in your inventory's item list (qb-core/shared/items.lua
--  for qb-inventory, or ox_inventory/data/items.lua) or the server cannot
--  hand it over and the take button will report the failure.
--
--  `par` is the station locker's full level. Stock is shared by every medic
--  and is stored in the fsm_medtab_stock table, so it survives a restart.
--  `takeLimit` caps how many one medic may draw in a single press.
--
Config.Supplies = {
    { item = 'bandage',       label = 'Sterile Bandage',    category = 'Dressing',       par = 24, takeLimit = 5, weightKg = 0.10, use = 'Controls minor to moderate external bleeding.' },
    { item = 'medkit',        label = 'First Aid Kit',      category = 'Kit',            par = 8,  takeLimit = 2, weightKg = 1.20, use = 'General field treatment for BLS-level injuries.' },
    { item = 'morphine',      label = 'Morphine 10mg',      category = 'Analgesia',      par = 10, takeLimit = 2, weightKg = 0.05, use = 'Severe pain control. ALS only, controlled log required.' },
    { item = 'defibrillator', label = 'AED Unit',           category = 'Device',         par = 4,  takeLimit = 1, weightKg = 3.40, use = 'Shockable rhythms — VF and pulseless VT.' },
    { item = 'iv_saline',     label = 'IV Saline 1L',       category = 'Fluids',         par = 12, takeLimit = 4, weightKg = 1.05, use = 'Volume replacement and drug carrier.' },
    { item = 'oxygen_mask',   label = 'O2 Non-Rebreather',  category = 'Airway',         par = 12, takeLimit = 3, weightKg = 0.20, use = 'High-flow oxygen for hypoxic patients.' },
    { item = 'suture_kit',    label = 'Suture Kit',         category = 'Kit',            par = 10, takeLimit = 3, weightKg = 0.30, use = 'Closes lacerations after irrigation.' },
    { item = 'epipen',        label = 'Epinephrine Pen',    category = 'Emergency',      par = 6,  takeLimit = 2, weightKg = 0.04, use = 'Anaphylaxis — 0.3mg IM, lateral thigh.' },
    { item = 'tourniquet',    label = 'CAT Tourniquet',     category = 'Haemorrhage',    par = 6,  takeLimit = 2, weightKg = 0.12, use = 'Catastrophic limb bleed. Log application time.' },
    { item = 'burn_gel',      label = 'Burn Gel',           category = 'Dressing',       par = 10, takeLimit = 3, weightKg = 0.15, use = 'Cools and covers partial-thickness burns.' },
    { item = 'splint',        label = 'SAM Splint',         category = 'Immobilisation', par = 8,  takeLimit = 2, weightKg = 0.25, use = 'Stabilises fractures and dislocations.' },
    { item = 'bloodbag',      label = 'Blood O-',           category = 'Fluids',         par = 4,  takeLimit = 2, weightKg = 0.50, use = 'Universal donor. Haemorrhagic shock only.' },
    { item = 'painkillers',   label = 'Analgesic Tablets',  category = 'Analgesia',      par = 20, takeLimit = 5, weightKg = 0.06, use = 'Mild to moderate pain, conscious patients.' },
}

-- Seconds between automatic restocks of every station locker back to par.
-- Set to 0 to disable and restock by hand (an admin can run /medtabrestock).
Config.RestockSeconds = 1800

-- ─────────────────────────────────────────────────────────────────────────
--  TREATMENT PROTOCOLS
-- ─────────────────────────────────────────────────────────────────────────
--
--  Everything the server enforces about a protocol is here.
--    cert     — 'BLS' or 'ALS', checked against Config.CertGrades
--    seconds  — how long it takes; the server refuses a finish that arrives early
--    item     — consumed from the medic's own inventory (nil = no item)
--    heal     — health points restored on the target (ped health, 100-200)
--    revive   — brings a dead/downed player back up
--    anim     — { dict, clip } played while working (nil = generic)
--    tone/icon/effect — presentation only, passed through to the tablet
--
Config.Protocols = {
    { id = 'p-abc',       name = 'Primary Survey (ABCDE)', cert = 'BLS', seconds = 20, item = nil,             heal = 0,  revive = false, icon = 'stethoscope', tone = 'assess', effect = 'Reveals hidden injuries and sets the triage tag.',        anim = { dict = 'amb@medic@standing@kneel@base',    clip = 'base' } },
    { id = 'p-cpr',       name = 'CPR - 30:2',             cert = 'BLS', seconds = 60, item = nil,             heal = 10, revive = false, icon = 'heart',       tone = 'crit',   effect = 'Maintains perfusion. Interrupt only for rhythm checks.',  anim = { dict = 'mini@cpr@char_a@cpr_str',          clip = 'cpr_pumpchest' } },
    { id = 'p-aed',       name = 'Defibrillation',         cert = 'ALS', seconds = 12, item = 'defibrillator', heal = 40, revive = true,  icon = 'zap',         tone = 'crit',   effect = '200J biphasic. Shockable rhythms only.',                  anim = { dict = 'mini@cpr@char_a@cpr_str',          clip = 'cpr_pumpchest' } },
    { id = 'p-tq',        name = 'Apply Tourniquet',       cert = 'BLS', seconds = 15, item = 'tourniquet',    heal = 15, revive = false, icon = 'bandage',     tone = 'crit',   effect = 'Stops catastrophic limb haemorrhage instantly.',          anim = { dict = 'amb@medic@standing@kneel@base',    clip = 'base' } },
    { id = 'p-seal',      name = 'Chest Seal',             cert = 'BLS', seconds = 18, item = 'bandage',       heal = 15, revive = false, icon = 'shield',      tone = 'crit',   effect = 'Seals a penetrating chest wound, prevents tension.',      anim = { dict = 'amb@medic@standing@kneel@base',    clip = 'base' } },
    { id = 'p-iv',        name = 'IV Access + Fluids',     cert = 'ALS', seconds = 35, item = 'iv_saline',     heal = 25, revive = false, icon = 'droplet',     tone = 'treat',  effect = 'Restores circulating volume, raises blood pressure.',     anim = { dict = 'amb@medic@standing@kneel@base',    clip = 'base' } },
    { id = 'p-blood',     name = 'Blood Transfusion',      cert = 'ALS', seconds = 50, item = 'bloodbag',      heal = 45, revive = true,  icon = 'droplet',     tone = 'crit',   effect = 'Reverses haemorrhagic shock. Cross-check blood type.',    anim = { dict = 'amb@medic@standing@kneel@base',    clip = 'base' } },
    { id = 'p-o2',        name = 'High-Flow Oxygen',       cert = 'BLS', seconds = 14, item = 'oxygen_mask',   heal = 12, revive = false, icon = 'wind',        tone = 'treat',  effect = 'Raises SpO2 in hypoxic or shocked patients.',             anim = { dict = 'amb@medic@standing@kneel@base',    clip = 'base' } },
    { id = 'p-morph',     name = 'Analgesia - Morphine',   cert = 'ALS', seconds = 22, item = 'morphine',      heal = 18, revive = false, icon = 'syringe',     tone = 'treat',  effect = 'Severe pain relief. Watch respiratory rate.',             anim = { dict = 'amb@medic@standing@kneel@base',    clip = 'base' } },
    { id = 'p-epi',       name = 'Epinephrine IM',         cert = 'BLS', seconds = 10, item = 'epipen',        heal = 20, revive = true,  icon = 'syringe',     tone = 'crit',   effect = 'Reverses anaphylaxis. Repeat after 5 min if needed.',     anim = { dict = 'amb@medic@standing@kneel@base',    clip = 'base' } },
    { id = 'p-splint',    name = 'Splint Fracture',        cert = 'BLS', seconds = 28, item = 'splint',        heal = 15, revive = false, icon = 'bone',        tone = 'treat',  effect = 'Immobilises the limb and reduces pain on movement.',      anim = { dict = 'amb@medic@standing@kneel@base',    clip = 'base' } },
    { id = 'p-suture',    name = 'Suture Laceration',      cert = 'ALS', seconds = 45, item = 'suture_kit',    heal = 22, revive = false, icon = 'scissors',    tone = 'treat',  effect = 'Closes a wound after irrigation. Stops slow bleeds.',     anim = { dict = 'amb@medic@standing@kneel@base',    clip = 'base' } },
    { id = 'p-burn',      name = 'Burn Dressing',          cert = 'BLS', seconds = 30, item = 'burn_gel',      heal = 18, revive = false, icon = 'flame',       tone = 'treat',  effect = 'Cools, covers, and limits fluid loss through the burn.',  anim = { dict = 'amb@medic@standing@kneel@base',    clip = 'base' } },
    { id = 'p-transport', name = 'Load & Transport',       cert = 'BLS', seconds = 40, item = nil,             heal = 30, revive = true,  icon = 'ambulance',   tone = 'assess', effect = 'Moves the patient to the nearest receiving facility.',    anim = { dict = 'amb@medic@standing@kneel@base',    clip = 'base' } },
}

-- Maximum distance (metres) between medic and patient for a treatment. The
-- server re-checks this when the treatment FINISHES as well as when it
-- starts, so walking away mid-progress cancels it.
Config.TreatDistance = 4.0

-- Health a revived player is brought back with (ped health is 100-200, where
-- 100 is dead). 160 leaves them hurt but standing.
Config.ReviveHealth = 160

-- If you run qb-ambulancejob, set this to true and the server will ALSO fire
-- its `hospital:client:Revive` event so its own death state is cleared.
-- Leave false to keep this resource standalone.
Config.UseQBAmbulanceRevive = false

-- ─────────────────────────────────────────────────────────────────────────
--  DISPATCH CALLS
-- ─────────────────────────────────────────────────────────────────────────

-- Raise a call automatically when a player goes down. Turn this off if a
-- dispatch resource already does it and you only want calls from the export.
Config.AutoCallOnDown = true

-- Minutes an untouched call stays on the board before it expires by itself.
Config.CallExpiryMinutes = 30

-- Priority given to an automatic "player down" call.
Config.AutoCallPriority = 1

-- Blip drawn for each open call.
Config.CallBlip = {
    enabled = true,
    sprite = 153,
    scale = 0.85,
    colours = { [1] = 1, [2] = 5, [3] = 2 }, -- by priority: red / yellow / green
    flashPriorityOne = true,
}

-- Seconds between unit position/vehicle heartbeats sent by each on-duty
-- medic. Lower is more live and more traffic; 5 is a good balance.
Config.HeartbeatSeconds = 5

-- ─────────────────────────────────────────────────────────────────────────
--  REPORTS & BILLING
-- ─────────────────────────────────────────────────────────────────────────

Config.Billing = {
    enabled = true,
    account = 'bank',    -- which patient account is charged
    maximum = 10000,     -- refuse anything above this, whatever the tablet sends
    payCrew = true,      -- split the fee between medics on duty
    crewShare = 0.35,    -- fraction of the bill shared with the crew
}

-- ─────────────────────────────────────────────────────────────────────────
--  INTEGRATION BRIDGES
-- ─────────────────────────────────────────────────────────────────────────

-- Which inventory to hand items through.
--   'auto'          detect from the resources that are running (recommended)
--   'qb-inventory'  exports['qb-inventory']:AddItem / RemoveItem
--   'ox_inventory'  exports.ox_inventory:AddItem / RemoveItem
--   'qb-core'       Player.Functions.AddItem / RemoveItem (older qb-core)
-- If a call fails, the server prints every name it tried — set this
-- explicitly to whichever one your server actually runs.
Config.Inventory = 'auto'

-- ─────────────────────────────────────────────────────────────────────────
--  INJURY MAPPING
-- ─────────────────────────────────────────────────────────────────────────
--
--  A patient's injuries are built from the bone the game says was hit last.
--  x/y are positions on the tablet's body diagram (0-120 wide, 0-200 tall),
--  so move a marker by editing its numbers here.
--
Config.BoneRegions = {
    [31086] = { region = 'Head',       label = 'Head',            x = 60, y = 20,  side = 'front' },
    [39317] = { region = 'Head',       label = 'Neck',            x = 60, y = 38,  side = 'front' },
    [24818] = { region = 'Thorax',     label = 'Upper chest',     x = 60, y = 62,  side = 'front' },
    [24817] = { region = 'Thorax',     label = 'Mid chest',       x = 60, y = 72,  side = 'front' },
    [24816] = { region = 'Abdomen',    label = 'Upper abdomen',   x = 60, y = 86,  side = 'front' },
    [23553] = { region = 'Abdomen',    label = 'Lower abdomen',   x = 60, y = 96,  side = 'front' },
    [57597] = { region = 'Back',       label = 'Lumbar spine',    x = 60, y = 92,  side = 'back'  },
    [11816] = { region = 'Pelvis',     label = 'Pelvis',          x = 60, y = 108, side = 'front' },
    [64729] = { region = 'Thorax',     label = 'Left clavicle',   x = 74, y = 54,  side = 'front' },
    [10706] = { region = 'Thorax',     label = 'Right clavicle',  x = 46, y = 54,  side = 'front' },
    [45509] = { region = 'Upper limb', label = 'Left upper arm',  x = 84, y = 74,  side = 'front' },
    [61163] = { region = 'Upper limb', label = 'Left forearm',    x = 89, y = 96,  side = 'front' },
    [18905] = { region = 'Upper limb', label = 'Left hand',       x = 92, y = 112, side = 'front' },
    [40269] = { region = 'Upper limb', label = 'Right upper arm', x = 36, y = 74,  side = 'front' },
    [28252] = { region = 'Upper limb', label = 'Right forearm',   x = 31, y = 96,  side = 'front' },
    [57005] = { region = 'Upper limb', label = 'Right hand',      x = 28, y = 112, side = 'front' },
    [58271] = { region = 'Lower limb', label = 'Left thigh',      x = 70, y = 134, side = 'front' },
    [63931] = { region = 'Lower limb', label = 'Left calf',       x = 72, y = 162, side = 'front' },
    [14201] = { region = 'Lower limb', label = 'Left foot',       x = 73, y = 188, side = 'front' },
    [51826] = { region = 'Lower limb', label = 'Right thigh',     x = 50, y = 134, side = 'front' },
    [36864] = { region = 'Lower limb', label = 'Right calf',      x = 48, y = 162, side = 'front' },
    [52301] = { region = 'Lower limb', label = 'Right foot',      x = 47, y = 188, side = 'front' },
}

-- Fallback marker when the game reports no damage bone at all.
Config.BoneFallback = { region = 'Thorax', label = 'Torso', x = 60, y = 76, side = 'front' }

-- How a weapon-class name is described in the patient's complaint line.
Config.DamageTypes = {
    bullet  = { label = 'Gunshot wound',        complaint = 'Penetrating trauma'  },
    melee   = { label = 'Laceration / blunt',   complaint = 'Blunt force trauma'  },
    vehicle = { label = 'Impact injury',        complaint = 'Polytrauma - MVA'    },
    fire    = { label = 'Thermal burn',         complaint = 'Burns'               },
    fall    = { label = 'Fall injury',          complaint = 'Fall from height'    },
    explosion = { label = 'Blast injury',       complaint = 'Blast trauma'        },
    unknown = { label = 'Undetermined injury',  complaint = 'Cause unknown'       },
}

-- Districts, used to name a call's area when the reporting client cannot
-- supply a street (a call raised by another resource through the CreateCall
-- export, for instance). The nearest centre within `radius` wins; anything
-- outside every radius is reported as "Blaine County".
-- These are approximate area centres — move or add entries freely.
Config.Districts = {
    { label = 'Vespucci Beach',   x = -1200.0, y = -1500.0, radius = 900.0  },
    { label = 'Del Perro',        x = -1600.0, y = -700.0,  radius = 800.0  },
    { label = 'Rockford Hills',   x = -1000.0, y = -300.0,  radius = 800.0  },
    { label = 'Vinewood',         x = 200.0,   y = 300.0,   radius = 900.0  },
    { label = 'Vinewood Hills',   x = -300.0,  y = 800.0,   radius = 1000.0 },
    { label = 'Downtown',         x = -300.0,  y = -900.0,  radius = 700.0  },
    { label = 'Pillbox Hill',     x = 200.0,   y = -800.0,  radius = 600.0  },
    { label = 'Mission Row',      x = 400.0,   y = -1000.0, radius = 500.0  },
    { label = 'Strawberry',       x = 200.0,   y = -1650.0, radius = 700.0  },
    { label = 'Davis',            x = 100.0,   y = -1950.0, radius = 700.0  },
    { label = 'Chamberlain Hills',x = -200.0,  y = -1650.0, radius = 600.0  },
    { label = 'La Mesa',          x = 800.0,   y = -1600.0, radius = 700.0  },
    { label = 'Mirror Park',      x = 1100.0,  y = -600.0,  radius = 700.0  },
    { label = 'East Vinewood',    x = 800.0,   y = -100.0,  radius = 700.0  },
    { label = 'Port of LS',       x = 200.0,   y = -2800.0, radius = 900.0  },
    { label = 'LS Airport',       x = -1000.0, y = -2600.0, radius = 900.0  },
    { label = 'Sandy Shores',     x = 1900.0,  y = 3700.0,  radius = 1400.0 },
    { label = 'Grand Senora',     x = 500.0,   y = 2800.0,  radius = 1600.0 },
    { label = 'Paleto Bay',       x = -200.0,  y = 6300.0,  radius = 1400.0 },
    { label = 'Grapeseed',        x = 1700.0,  y = 4800.0,  radius = 1200.0 },
    { label = 'Mount Chiliad',    x = 500.0,   y = 5600.0,  radius = 1400.0 },
    { label = 'Chumash',          x = -3200.0, y = 1100.0,  radius = 1300.0 },
}

-- Optional: if your server already runs a postal/nearest-postal resource,
-- name it here and the tablet will show its codes instead of the grid
-- reference it works out from the coordinates itself. Leave `resource` empty
-- to keep the built-in grid reference (e.g. "K-14").
-- The export is called as exports[resource][export](x, y) and must return
-- something printable; if it errors, the grid reference is used instead.
Config.Postal = {
    resource = '',
    export = '',
}

-- Which weapons count as what kind of injury. Anything not listed here is
-- treated as a bullet wound, which is the right default for every firearm.
-- The first six are the game's own pseudo-weapons for non-weapon deaths.
Config.DamageWeapons = {
    ['WEAPON_RUN_OVER_BY_CAR']      = 'vehicle',
    ['WEAPON_RAMMED_BY_CAR']        = 'vehicle',
    ['WEAPON_FALL']                 = 'fall',
    ['WEAPON_DROWNING']             = 'fall',
    ['WEAPON_FIRE']                 = 'fire',
    ['WEAPON_EXPLOSION']            = 'explosion',

    ['WEAPON_UNARMED']              = 'melee',
    ['WEAPON_BAT']                  = 'melee',
    ['WEAPON_BATTLEAXE']            = 'melee',
    ['WEAPON_BOTTLE']               = 'melee',
    ['WEAPON_CANDYCANE']            = 'melee',
    ['WEAPON_CROWBAR']              = 'melee',
    ['WEAPON_DAGGER']               = 'melee',
    ['WEAPON_FLASHLIGHT']           = 'melee',
    ['WEAPON_GOLFCLUB']             = 'melee',
    ['WEAPON_HAMMER']               = 'melee',
    ['WEAPON_HATCHET']              = 'melee',
    ['WEAPON_KNIFE']                = 'melee',
    ['WEAPON_MACHETE']              = 'melee',
    ['WEAPON_NIGHTSTICK']           = 'melee',
    ['WEAPON_POOLCUE']              = 'melee',
    ['WEAPON_STONE_HATCHET']        = 'melee',
    ['WEAPON_SWITCHBLADE']          = 'melee',
    ['WEAPON_WRENCH']               = 'melee',
    ['WEAPON_STUNROD']              = 'melee',

    ['WEAPON_MOLOTOV']              = 'fire',
    ['WEAPON_PETROLCAN']            = 'fire',
    ['WEAPON_FLARE']                = 'fire',
    ['WEAPON_FIREWORK']             = 'fire',
    ['WEAPON_FLAREGUN']             = 'fire',

    ['WEAPON_GRENADE']              = 'explosion',
    ['WEAPON_PIPEBOMB']             = 'explosion',
    ['WEAPON_STICKYBOMB']           = 'explosion',
    ['WEAPON_PROXMINE']             = 'explosion',
    ['WEAPON_RPG']                  = 'explosion',
    ['WEAPON_GRENADELAUNCHER']      = 'explosion',
    ['WEAPON_COMPACTLAUNCHER']      = 'explosion',
    ['WEAPON_HOMINGLAUNCHER']       = 'explosion',
    ['WEAPON_RAILGUN']              = 'explosion',
}

-- ─────────────────────────────────────────────────────────────────────────
--  DISPATCH MAP
-- ─────────────────────────────────────────────────────────────────────────
--
--  The Dispatch page draws a Leaflet map of Los Santos. Out of the box it
--  uses the map plate bundled with this resource, which needs no setup.
--
--  If you already host a Los Santos tile set, put its URL template here and
--  the tablet will use that instead — the usual {z}/{x}/{y} pyramid, e.g.
--  'https://your-host.example/losantos/{z}/{x}/{y}.png'. Leave it empty to
--  keep the bundled plate.
--
--  NOTE: CEF loads this URL directly, so it must be reachable from the
--  player's machine, not just from the server.
--
Config.MapTileUrl = ''
