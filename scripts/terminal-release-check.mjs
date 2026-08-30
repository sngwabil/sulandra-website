#!/usr/bin/env node

export function evaluateRelease(services) {
  if (!Array.isArray(services) || services.length === 0) {
    throw new TypeError('services must be a non-empty array');
  }

  const normalized = services.map((service, index) => {
    const name = String(service?.name || `service-${index + 1}`).trim();
    const status = String(service?.status || 'UNKNOWN').trim().toUpperCase();
    return { name, status };
  });

  const healthy = normalized.filter((service) => service.status === 'SUCCESS');
  const unhealthy = normalized.filter((service) => service.status !== 'SUCCESS');

  return {
    total: normalized.length,
    healthy: healthy.length,
    unhealthy,
    safeToPromote: unhealthy.length === 0,
  };
}

function scenarioFromArgs(argv) {
  const requested = argv.find((arg) => arg.startsWith('--scenario='))?.split('=')[1] || 'healthy';
  if (requested === 'degraded') {
    return [
      { name: 'Sulandra Static Website', status: 'SUCCESS' },
      { name: 'sulandra-website', status: 'SUCCESS' },
      { name: 'sulandra-coding-terminal-worker', status: 'DEPLOYING' },
    ];
  }

  return [
    { name: 'Sulandra Static Website', status: 'SUCCESS' },
    { name: 'sulandra-website', status: 'SUCCESS' },
    { name: 'sulandra-coding-terminal-worker', status: 'SUCCESS' },
  ];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = evaluateRelease(scenarioFromArgs(process.argv.slice(2)));

  console.log(`Checked ${result.total} Sulandra production services.`);
  console.log(`Healthy: ${result.healthy}/${result.total}`);

  if (result.safeToPromote) {
    console.log('RESULT: SAFE TO PROMOTE');
  } else {
    console.log('RESULT: HOLD RELEASE');
    for (const service of result.unhealthy) {
      console.log(`- ${service.name}: ${service.status}`);
    }
    process.exitCode = 2;
  }
}
