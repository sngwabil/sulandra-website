export default {
  testDir:'./tests',
  testMatch:/employee360-.*\.spec\.mjs/,
  timeout:45_000,
  retries:1,
  use:{baseURL:'http://127.0.0.1:4173',headless:true,viewport:{width:1440,height:1000}},
  webServer:{command:'node tests/static-server.mjs',url:'http://127.0.0.1:4173/employee360.html',reuseExistingServer:false,timeout:30_000},
  reporter:[['list']]
};
