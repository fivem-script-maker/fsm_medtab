# MEDTAB — EMS Medical Tablet

A full EMS tablet for QBCore: dispatch board with a live GTA V map, patient
charting with vitals and a body map, a treatment catalogue that spends real
inventory items, station supply lockers, a fleet roster, and patient care
reports that bill the patient's bank account.

The server owns every rule. The tablet displays what the server sends and asks
it for everything else — it never decides a price, a stock level, a
certification or a distance on its own.

---

## 1. Requirements

| Resource | Required | What happens without it |
|---|---|---|
| `qb-core` | **yes** | The resource will not start. |
| `oxmysql` | no | Everything still works, but station stock, calls, reports and shift statistics live in memory and reset on restart. |
| An inventory | effectively yes | Drawing supplies and spending items fails. The bridge auto-detects `ox_inventory`, `qb-inventory` and plain `qb-core` item functions. |

Tested against QBCore's standard player object (`PlayerData`, `citizenid`,
`charinfo`, `metadata`, `job.grade.level`, `job.onduty`).

---

## 2. Install

1. Drop the `fsm_medtab` folder into your `resources/` directory.
2. Add it to `server.cfg` **after** `qb-core` (and after `oxmysql` if you use it):

   ```cfg
   ensure qb-core
   ensure oxmysql
   ensure fsm_medtab
   ```

3. **Database (optional).** With `oxmysql` running the four tables are created
   automatically on first start. To import them yourself instead, run
   `sql/fsm_medtab.sql`.

4. **Items.** Every id in `Config.Supplies` must exist in your inventory's item
   list, or the medic can never draw it. The defaults are:

   `bandage`, `medkit`, `morphine`, `defibrillator`, `iv_saline`,
   `oxygen_mask`, `suture_kit`, `epipen`, `tourniquet`, `burn_gel`,
   `splint`, `bloodbag`, `painkillers`

   If your server already uses different names, change the `item = '…'` field in
   `Config.Supplies` — the protocol list refers to items by the same ids.

5. **Station coordinates.** `Config.Stations` ships with Pillbox, Sandy Shores
   and Paleto Bay. The `supply` vector3 on each one is the point a medic must
   stand at to draw or return stock. Move them to your own map.

6. Restart the server (or `refresh` then `ensure fsm_medtab`).

The interface is pre-built into `web/dist`, so no build step is needed to run
the resource. To change the interface, edit `web/src` and run `npm install` then
`npm run build` inside `web/`.

---

## 3. Opening the tablet

- Command: `/medtab`
- Keybind: **F6** by default, rebindable by each player under
  *Settings → Key Bindings → FiveM*.

Both are `Config.Command`, `Config.Keybind` and `Config.OpenWithKeybind`.

A player may open it only if all of this is true, and it is re-checked on every
state push, not just when the tablet opens:

- their job is a key in `Config.Jobs` (`ambulance` by default),
- they are clocked on, if `Config.RequireDuty` is true.

Go off duty with the tablet open and it closes itself.

---

## 4. Configuration — `config.lua`

Everything a server owner needs to retune is in there, grouped and commented.
The values worth knowing about:

| Key | What it does |
|---|---|
| `Config.Jobs` | Which jobs may open the tablet. |
| `Config.RequireDuty` | Require the player to be clocked on. |
| `Config.CertGrades` | Job grade needed for BLS and ALS protocols. |
| `Config.CommandGrade` | Grade that may page other units. |
| `Config.Stations` | Station name, blip and the supply point coordinates. |
| `Config.StationRadius` | How close a medic must stand to a locker. |
| `Config.Supplies` | The item list: id, label, par level, carry limit, weight. |
| `Config.RestockSeconds` | Automatic locker restock interval (0 disables it). |
| `Config.Protocols` | The treatment catalogue: cert, duration, item spent, healing, whether it revives, animation. |
| `Config.TreatDistance` | How close the medic must be to the patient. |
| `Config.ReviveHealth` | Health a revived player comes back with. |
| `Config.AutoCallOnDown` | Raise a call automatically when a player goes down. |
| `Config.CallExpiryMinutes` | How long an unassigned call stays on the board. |
| `Config.Billing` | Whether care is charged, from which account, the cap, and the crew's share. |
| `Config.Inventory` | `'auto'`, or force a specific inventory bridge. |
| `Config.MapTileUrl` | Point the dispatch map at your own map tiles. |

---

## 5. How it fits together

```
client/main.lua ──▶ server/main.lua ──▶ world / database
      ▲                    │
      └──── state push ────┘   (one payload, every 2 seconds, to open tablets)
```

- **`config.lua`** — every rule, in one place. Shared with both sides.
- **`client/main.lua`** — NUI focus, blips, animations, the progress bar, and
  the natives only a client can call (street names, fuel, the damage bone).
  It reports what it reads to the server and applies what it is told.
- **`server/main.lua`** — the roster, the call board, patients, vitals,
  treatments, supplies, reports and billing. It is the only writer of anything.
- **`server/inventory.lua`** — the inventory bridge. It probes `ox_inventory`,
  `qb-inventory` and `qb-core` in that order, inside `pcall`, and prints every
  export name it tried if none of them answer.
- **`server/db.lua`** — oxmysql wrapper. If oxmysql is absent, every function
  falls back to memory and `Medtab.DB.available` is false.
- **`web/`** — the React interface. `web/src/state/store.jsx` is the only place
  that talks to the game; the pages just read from it.

### Why the tablet can't lie

Treatments are token-gated. `beginTreatment` checks the job, duty, grade,
distance and the item, takes the item, and issues a token stamped with the
server's own clock. `finishTreatment` refuses the token if less time has passed
than the protocol requires, or if the medic has walked away. A client that
claims "done" early gets nothing, and an abandoned treatment is swept up and the
item refunded.

Report fees work the same way: the tablet sends protocol **ids**, never an
amount. The server prices the care from `config.lua`, caps it at
`Config.Billing.maximum`, and only then touches anyone's bank account.

---

## 6. Exports

For other resources — a dispatch script, a police resource, a crash detector:

```lua
-- Raise a call. Returns the call reference (e.g. "EMS-1041").
local ref = exports['fsm_medtab']:CreateCall({
    coords      = vector3(311.2, -593.4, 43.2),  -- required
    priority    = 1,                              -- 1, 2 or 3
    type        = 'Traffic Collision',
    code        = '10-50',
    notes       = 'Two vehicles, one occupant unresponsive.',
    caller      = 'Passer-by',
    callerPhone = '911',
    patients    = 2,
    pdOnScene   = true,
    patientSrc  = 14,                             -- server id, optional
})

-- Close a call that is still on the board. Returns true if it was open.
exports['fsm_medtab']:CloseCall(ref, 'Cancelled')

-- Read the current board.
local calls = exports['fsm_medtab']:GetCalls()
```

## 7. Admin commands

| Command | Who | What |
|---|---|---|
| `/medtabrestock` | admin | Restocks every station locker to par. |
| `/medtabcall` | admin | Raises a test call at your position. |

---

## 8. What has been checked, and what has not

**Checked here:** the native and framework calls (every native exists and is
called from the correct side; every QBCore call is checked against the API
index), the interface builds clean, and the pages were inspected in a browser at
several viewport sizes.

**Not checked here, and it needs your server:** everything that only exists in
game. NUI focus, the keybind, the QBCore job and duty checks against your own
job table, your inventory's item names, the station coordinates on your map, the
progress bar, reviving, and billing against real bank accounts. Start it on a
test server and run one call end to end before putting it live.
