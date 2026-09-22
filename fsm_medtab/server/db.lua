--[[
    fsm_medtab — persistence (server)

    Everything that must survive a restart lives here: the station lockers,
    filed reports, the call log the shift statistics are built from, and the
    treatment audit trail.

    oxmysql is optional. If it is not running the resource still works — stock
    and reports are kept in memory for the session and a clear warning is
    printed — because a medical tablet that refuses to open because of a
    missing database is worse than one that forgets last week's paperwork.

    Every query below is parameterised. No value is ever concatenated into SQL.
]]

Medtab = Medtab or {}
Medtab.DB = { available = false }

local function oxRunning()
    local state = GetResourceState('oxmysql')
    return state == 'started' or state == 'starting'
end

--- Wraps an oxmysql export so a missing one cannot throw on the index.
local function call(method, query, params, cb)
    if not Medtab.DB.available then
        if cb then cb(nil) end
        return
    end
    local ok = pcall(function()
        exports.oxmysql[method](exports.oxmysql, query, params or {}, function(result)
            if cb then cb(result) end
        end)
    end)
    if not ok then
        Medtab.DB.available = false
        print('[fsm_medtab] oxmysql call failed — continuing without persistence for this session.')
        if cb then cb(nil) end
    end
end

function Medtab.DB.Query(query, params, cb) call('query', query, params, cb) end
function Medtab.DB.Single(query, params, cb) call('single', query, params, cb) end
function Medtab.DB.Scalar(query, params, cb) call('scalar', query, params, cb) end
function Medtab.DB.Insert(query, params, cb) call('insert', query, params, cb) end
function Medtab.DB.Update(query, params, cb) call('update', query, params, cb) end
function Medtab.DB.Execute(query, params, cb) call('execute', query, params, cb) end

-- ── schema ────────────────────────────────────────────────────────────────
-- Also shipped as sql/fsm_medtab.sql for owners who prefer to import by hand.
-- Creating it here too means a forgotten import is not a silent half-failure.

local SCHEMA = {
    [[CREATE TABLE IF NOT EXISTS `fsm_medtab_stock` (
        `station` VARCHAR(32) NOT NULL,
        `item` VARCHAR(64) NOT NULL,
        `stock` INT NOT NULL DEFAULT 0,
        PRIMARY KEY (`station`, `item`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],

    [[CREATE TABLE IF NOT EXISTS `fsm_medtab_calls` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `ref` VARCHAR(24) NOT NULL,
        `code` VARCHAR(16) DEFAULT NULL,
        `priority` TINYINT NOT NULL DEFAULT 2,
        `type` VARCHAR(64) DEFAULT NULL,
        `street` VARCHAR(160) DEFAULT NULL,
        `district` VARCHAR(96) DEFAULT NULL,
        `x` FLOAT DEFAULT NULL,
        `y` FLOAT DEFAULT NULL,
        `z` FLOAT DEFAULT NULL,
        `patient_cid` VARCHAR(64) DEFAULT NULL,
        `opened_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        `closed_at` TIMESTAMP NULL DEFAULT NULL,
        `closed_by` VARCHAR(32) DEFAULT NULL,
        `outcome` VARCHAR(48) DEFAULT NULL,
        PRIMARY KEY (`id`),
        KEY `ref` (`ref`),
        KEY `opened_at` (`opened_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],

    [[CREATE TABLE IF NOT EXISTS `fsm_medtab_reports` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `ref` VARCHAR(24) NOT NULL,
        `call_ref` VARCHAR(24) DEFAULT NULL,
        `medic_cid` VARCHAR(64) NOT NULL,
        `medic_name` VARCHAR(96) DEFAULT NULL,
        `callsign` VARCHAR(24) DEFAULT NULL,
        `patient_cid` VARCHAR(64) DEFAULT NULL,
        `patient_name` VARCHAR(96) DEFAULT NULL,
        `type` VARCHAR(32) DEFAULT NULL,
        `complaint` VARCHAR(191) DEFAULT NULL,
        `narrative` TEXT,
        `procedures` TEXT,
        `outcome` VARCHAR(48) DEFAULT NULL,
        `billed` INT NOT NULL DEFAULT 0,
        `status` VARCHAR(16) NOT NULL DEFAULT 'filed',
        `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        KEY `medic_cid` (`medic_cid`),
        KEY `created_at` (`created_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],

    [[CREATE TABLE IF NOT EXISTS `fsm_medtab_treatments` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `medic_cid` VARCHAR(64) NOT NULL,
        `callsign` VARCHAR(24) DEFAULT NULL,
        `patient_cid` VARCHAR(64) DEFAULT NULL,
        `protocol` VARCHAR(32) NOT NULL,
        `item` VARCHAR(64) DEFAULT NULL,
        `succeeded` TINYINT(1) NOT NULL DEFAULT 1,
        `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        KEY `medic_cid` (`medic_cid`),
        KEY `created_at` (`created_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],
}

--- Brings the schema up and then hands control to `done`.
function Medtab.DB.Init(done)
    if not oxRunning() then
        print('[fsm_medtab] oxmysql is not running — reports, stock and shift statistics')
        print('[fsm_medtab] will be kept in memory only and reset when the resource restarts.')
        print('[fsm_medtab] Start oxmysql and restart fsm_medtab for persistence.')
        Medtab.DB.available = false
        done(false)
        return
    end

    Medtab.DB.available = true

    local remaining = #SCHEMA
    for _, statement in ipairs(SCHEMA) do
        Medtab.DB.Query(statement, {}, function()
            remaining = remaining - 1
            if remaining == 0 then
                print('[fsm_medtab] database ready (4 tables verified).')
                done(Medtab.DB.available)
            end
        end)
    end
end

-- ── the queries the rest of the resource uses ─────────────────────────────

function Medtab.DB.LoadStock(cb)
    Medtab.DB.Query('SELECT `station`, `item`, `stock` FROM `fsm_medtab_stock`', {}, function(rows)
        cb(rows or {})
    end)
end

function Medtab.DB.SaveStock(station, item, stock)
    Medtab.DB.Execute(
        'INSERT INTO `fsm_medtab_stock` (`station`, `item`, `stock`) VALUES (?, ?, ?) ' ..
        'ON DUPLICATE KEY UPDATE `stock` = VALUES(`stock`)',
        { station, item, stock }
    )
end

function Medtab.DB.LogCall(call)
    Medtab.DB.Insert(
        'INSERT INTO `fsm_medtab_calls` (`ref`, `code`, `priority`, `type`, `street`, `district`, `x`, `y`, `z`, `patient_cid`) ' ..
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        { call.id, call.code, call.priority, call.type, call.street, call.district,
          call.coords and call.coords.x, call.coords and call.coords.y, call.coords and call.coords.z,
          call.patientCid }
    )
end

function Medtab.DB.CloseCall(ref, callsign, outcome)
    Medtab.DB.Execute(
        'UPDATE `fsm_medtab_calls` SET `closed_at` = CURRENT_TIMESTAMP, `closed_by` = ?, `outcome` = ? ' ..
        'WHERE `ref` = ? AND `closed_at` IS NULL',
        { callsign, outcome, ref }
    )
end

function Medtab.DB.InsertReport(report, cb)
    Medtab.DB.Insert(
        'INSERT INTO `fsm_medtab_reports` (`ref`, `call_ref`, `medic_cid`, `medic_name`, `callsign`, ' ..
        '`patient_cid`, `patient_name`, `type`, `complaint`, `narrative`, `procedures`, `outcome`, `billed`, `status`) ' ..
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        { report.id, report.callId, report.medicCid, report.author, report.callsign,
          report.patientCid, report.patient, report.type, report.complaint, report.narrative,
          json.encode(report.procedures or {}), report.outcome, report.billed, report.status },
        function(insertId) if cb then cb(insertId) end end
    )
end

function Medtab.DB.RecentReports(limit, cb)
    Medtab.DB.Query(
        'SELECT `ref`, `call_ref`, `medic_name`, `callsign`, `patient_name`, `type`, `outcome`, ' ..
        '`billed`, `status`, `created_at` FROM `fsm_medtab_reports` ORDER BY `id` DESC LIMIT ?',
        { limit },
        function(rows) cb(rows or {}) end
    )
end

function Medtab.DB.LogTreatment(entry)
    Medtab.DB.Insert(
        'INSERT INTO `fsm_medtab_treatments` (`medic_cid`, `callsign`, `patient_cid`, `protocol`, `item`, `succeeded`) ' ..
        'VALUES (?, ?, ?, ?, ?, ?)',
        { entry.medicCid, entry.callsign, entry.patientCid, entry.protocol, entry.item, entry.succeeded and 1 or 0 }
    )
end

--- Shift figures for one medic, counted over the last `hours` hours.
function Medtab.DB.ShiftStats(citizenid, hours, cb)
    local stats = { treated = 0, transported = 0, revenue = 0, reports = 0, deceased = 0 }
    if not Medtab.DB.available then cb(stats) return end

    Medtab.DB.Single(
        'SELECT COUNT(*) AS `reports`, ' ..
        'COALESCE(SUM(`billed`), 0) AS `revenue`, ' ..
        "COALESCE(SUM(CASE WHEN `outcome` = 'Transported' THEN 1 ELSE 0 END), 0) AS `transported`, " ..
        "COALESCE(SUM(CASE WHEN `outcome` = 'Deceased' THEN 1 ELSE 0 END), 0) AS `deceased` " ..
        'FROM `fsm_medtab_reports` WHERE `medic_cid` = ? AND `created_at` >= DATE_SUB(NOW(), INTERVAL ? HOUR)',
        { citizenid, hours },
        function(row)
            if row then
                stats.reports = tonumber(row.reports) or 0
                stats.revenue = tonumber(row.revenue) or 0
                stats.transported = tonumber(row.transported) or 0
                stats.deceased = tonumber(row.deceased) or 0
            end
            Medtab.DB.Scalar(
                'SELECT COUNT(DISTINCT `patient_cid`) FROM `fsm_medtab_treatments` ' ..
                'WHERE `medic_cid` = ? AND `created_at` >= DATE_SUB(NOW(), INTERVAL ? HOUR)',
                { citizenid, hours },
                function(value)
                    stats.treated = tonumber(value) or 0
                    cb(stats)
                end
            )
        end
    )
end

--- Calls opened per hour over the last `buckets` hours, oldest first. Drives
--- the Overview page's call-rate chart.
function Medtab.DB.HourlyCalls(buckets, cb)
    local out = {}
    for i = 1, buckets do out[i] = 0 end
    if not Medtab.DB.available then cb(out) return end

    Medtab.DB.Query(
        'SELECT TIMESTAMPDIFF(HOUR, `opened_at`, NOW()) AS `age`, COUNT(*) AS `n` ' ..
        'FROM `fsm_medtab_calls` WHERE `opened_at` >= DATE_SUB(NOW(), INTERVAL ? HOUR) GROUP BY `age`',
        { buckets },
        function(rows)
            for _, row in ipairs(rows or {}) do
                local age = tonumber(row.age) or 0
                -- age 0 is the current hour, which belongs at the end.
                local slot = buckets - age
                if slot >= 1 and slot <= buckets then out[slot] = tonumber(row.n) or 0 end
            end
            cb(out)
        end
    )
end
