import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { authOptions } from '../lib/auth';

async function runAuthTests() {
  console.log('🧪 Starting Phase 3 Authentication Tests...\n');

  let testUserId = '';
  const testEmail = `authtest_${Date.now()}@example.com`;
  const rawPassword = 'SecurePassword123!';

  try {
    // 1. Password Hashing Test
    console.log('Test 1: Hashing password securely via bcrypt...');
    const passwordHash = await bcrypt.hash(rawPassword, 10);
    assert.notEqual(passwordHash, rawPassword, 'Password must be hashed, not plaintext');
    assert.ok(await bcrypt.compare(rawPassword, passwordHash), 'bcrypt.compare should return true for valid password');
    assert.equal(await bcrypt.compare('WrongPassword', passwordHash), false, 'bcrypt.compare should return false for invalid password');
    console.log('✅ PASS: Password hashing & bcrypt verification works correctly.\n');

    // 2. User Creation & Registration Flow Test
    console.log('Test 2: Creating user record with hashed password...');
    const createdUser = await prisma.user.create({
      data: {
        name: 'Auth Test User',
        email: testEmail,
        passwordHash: passwordHash,
      },
    });
    testUserId = createdUser.id;
    assert.ok(createdUser.id, 'User ID must be generated');
    assert.equal(createdUser.email, testEmail, 'Email must match input');
    assert.equal(createdUser.passwordHash, passwordHash, 'Stored passwordHash must match generated bcrypt hash');
    console.log(`✅ PASS: Created user ID: ${createdUser.id}\n`);

    // 3. Duplicate Email Prevention Test
    console.log('Test 3: Testing duplicate email prevention...');
    try {
      await prisma.user.create({
        data: {
          name: 'Duplicate User',
          email: testEmail,
          passwordHash: passwordHash,
        },
      });
      assert.fail('Database should reject duplicate email creation');
    } catch (err: any) {
      assert.ok(err.code === 'P2002', 'Prisma unique constraint P2002 expected on duplicate email');
      console.log('✅ PASS: Duplicate email correctly rejected with unique constraint error.\n');
    }

    // 4. NextAuth Authorize Callback Test (Valid Credentials)
    console.log('Test 4: Testing NextAuth authorize provider with valid credentials...');
    const provider = authOptions.providers[0] as any;
    const authorize = provider.options.authorize;
    const authResult = await authorize({ email: testEmail, password: rawPassword }, {} as any);
    assert.ok(authResult, 'Authorize should return user object for valid credentials');
    assert.equal(authResult.id, testUserId, 'Returned user ID must match registered ID');
    assert.equal(authResult.email, testEmail, 'Returned email must match registered email');
    assert.equal((authResult as any).passwordHash, undefined, 'passwordHash MUST NOT be exposed in authResult');
    console.log('✅ PASS: Authorize returned safe user object without exposing passwordHash.\n');

    // 5. NextAuth Authorize Callback Test (Invalid Password)
    console.log('Test 5: Testing NextAuth authorize provider with wrong password...');
    const wrongPassResult = await authorize({ email: testEmail, password: 'WrongPassword999' });
    assert.equal(wrongPassResult, null, 'Authorize must return null for wrong password');
    console.log('✅ PASS: Wrong password rejected cleanly with null.\n');

    // 6. NextAuth Authorize Callback Test (Non-existent Email)
    console.log('Test 6: Testing NextAuth authorize provider with non-existent email...');
    const noEmailResult = await authorize({ email: 'nonexistent_user_99999@example.com', password: rawPassword });
    assert.equal(noEmailResult, null, 'Authorize must return null for non-existent email');
    console.log('✅ PASS: Non-existent email rejected cleanly with null.\n');

    // 7. Session Callback Payload Security Test
    console.log('Test 7: Testing NextAuth session callback payload...');
    const jwtCallback = authOptions.callbacks?.jwt as Function;
    const sessionCallback = authOptions.callbacks?.session as Function;

    const token = await jwtCallback({ token: {}, user: { id: testUserId } });
    assert.equal(token.id, testUserId, 'JWT token must store user id');

    const sessionPayload = await sessionCallback({
      session: { user: { name: 'Auth Test User', email: testEmail } },
      token: { id: testUserId },
    });
    assert.equal(sessionPayload.user.id, testUserId, 'Session user must include user id');
    assert.equal(sessionPayload.user.passwordHash, undefined, 'Session user MUST NOT include passwordHash');
    console.log('✅ PASS: Session callback appends user id safely without passwordHash.\n');

    console.log('🎉 ALL 7 AUTHENTICATION UNIT TESTS PASSED SUCCESSFULLY!\n');
  } catch (error) {
    console.error('❌ Auth Test Failed:', error);
    process.exit(1);
  } finally {
    // Cleanup test user
    if (testUserId) {
      await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    }
    await prisma.$disconnect();
  }
}

runAuthTests();
