import { resetUserAccess } from './app/actions/auth-actions';

async function main() {
  console.log('Testing resetUserAccess...');
  const res = await resetUserAccess('test-uid-1234', 'testesilva@test.com');
  console.log('Result:', res);
}

main().catch(console.error);
