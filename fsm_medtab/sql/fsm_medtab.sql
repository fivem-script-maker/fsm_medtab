-- ═══════════════════════════════════════════════════════════════════════════
--  fsm_medtab — EMS Medical Tablet
--  Database schema (MySQL / MariaDB)
--
--  You do NOT have to run this by hand. If oxmysql is running, the resource
--  creates these four tables itself on the first start. This file is here for
--  server owners who would rather import the schema up front, review it, or
--  keep it in version control with the rest of their database.
--
--  Without oxmysql the resource still runs: station stock, calls, reports and
--  shift statistics are then held in memory and reset when the server or the
--  resource restarts.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Station locker levels ──────────────────────────────────────────────────
-- One row per station per item. Written whenever a medic draws or returns
-- stock, and whenever the automatic restock loop tops a locker back up to par.
CREATE TABLE IF NOT EXISTS `fsm_medtab_stock` (
    `station` VARCHAR(32) NOT NULL,
    `item` VARCHAR(64) NOT NULL,
    `stock` INT NOT NULL DEFAULT 0,
    PRIMARY KEY (`station`, `item`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Dispatch calls ─────────────────────────────────────────────────────────
-- Every call the board has ever carried, open or closed. `ref` is the call
-- reference the tablet shows (EMS-1041 and so on). The hourly call graph on
-- the overview page is a COUNT over `opened_at`.
CREATE TABLE IF NOT EXISTS `fsm_medtab_calls` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Patient care reports ───────────────────────────────────────────────────
-- Filed from the Reports page. `billed` is what the SERVER decided to charge,
-- priced from the procedures logged — the tablet never sends an amount.
-- `procedures` holds the protocol ids as JSON.
CREATE TABLE IF NOT EXISTS `fsm_medtab_reports` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Treatment log ──────────────────────────────────────────────────────────
-- One row per completed or cancelled protocol. This is what the "patients
-- treated" figure on the overview page counts.
CREATE TABLE IF NOT EXISTS `fsm_medtab_treatments` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
