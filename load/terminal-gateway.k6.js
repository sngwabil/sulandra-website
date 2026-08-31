import http from 'k6/http';
import { check, sleep } from 'k6';

const baseUrl = __ENV.TERMINAL_GATEWAY_BASE_URL || 'http://127.0.0.1:18080';

export const options = {
  scenarios: {
    sustained_multi_user_gateway: {
      executor: 'constant-vus',
      vus: Number(__ENV.K6_VUS || 25),
      duration: __ENV.K6_DURATION || '90s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
    checks: ['rate>0.99'],
  },
};

export default function () {
  const response = http.get(`${baseUrl}/health`, {
    tags: { surface: 'terminal-gateway-health' },
    timeout: '3s',
  });
  check(response, {
    'gateway health returns 200': r => r.status === 200,
    'gateway health identifies gateway': r => {
      try {
        const body = r.json();
        return body && body.ok === true && body.gateway === true;
      } catch {
        return false;
      }
    },
  });
  sleep(0.2);
}
