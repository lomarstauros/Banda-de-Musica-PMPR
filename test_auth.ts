import { resetUserAccess } from './app/actions/auth-actions';

async function test() {
  try {
    console.log('Testing resetUserAccess...');
    const result = await resetUserAccess('test-uid-12345', 'test12345@gmail.com');
    console.log('Result:', result);
  } catch(e) {
    console.error('Error:', e);
  }
}
test();
