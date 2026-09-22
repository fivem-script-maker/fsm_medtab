fx_version 'cerulean'
game 'gta5'

name 'fsm_medtab'
description 'EMS Medical Tablet'
author 'FiveM Script Maker'
version '1.0.0'

-- Required: this resource is built for QBCore.
dependency 'qb-core'

ui_page 'web/dist/index.html'

shared_script 'config.lua'

client_script 'client/main.lua'

-- Order matters: the bridge and the database layer both publish onto the
-- shared Medtab table that main.lua then uses.
server_scripts {
    'server/inventory.lua',
    'server/db.lua',
    'server/main.lua',
}

files {
    'web/dist/index.html',
    'web/dist/**/*',
}

-- oxmysql is optional. Without it the tablet still runs, but reports, station
-- stock and shift statistics are kept in memory and reset on restart.
-- Uncomment to have FXServer enforce the start order when you do run it:
-- dependency 'oxmysql'
