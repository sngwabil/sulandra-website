// Retained as a no-op compatibility step in build:web.
// Canonical Admin Employee 360 source repairs now run in
// scripts/fix-employee-compliance-frontend.mjs before build-static-site.mjs copies
// the frontend into dist-web. Keeping this file non-mutating avoids source/dist
// drift while existing build references are removed in a later cleanup.
console.log('Admin runtime publication compatibility step: no additional mutation required.');
