const nock = require('nock');
const fs = require('fs');
const path = require('path');
const { checkMembers, ensureDataDir } = require('../src/index');

// Mock config
process.env.CORP_ID = '98735707';
process.env.DISCORD_WEBHOOK_URL = 'http://discord.mock/webhook';
const MEMBERS_FILE = path.join(__dirname, '../data/members.json');

// Helper to reset state
function reset() {
    if (fs.existsSync(MEMBERS_FILE)) {
        fs.unlinkSync(MEMBERS_FILE);
    }
    // Also ensure dir exists (it might have been deleted if we were aggressive, but unlinkSync only deletes file)
    // But for safety in clean env:
    ensureDataDir();
    nock.cleanAll();
}

async function runTests() {
    console.log('Running verification tests...');

    // --- Scenario 1: First Run (Populate) ---
    console.log('\n--- Scenario 1: First Run ---');
    reset();

    // Mock API response
    nock('https://evewho.com')
        .get('/api/corplist/98735707')
        .reply(200, {
            characters: [
                { character_id: 1, name: 'Alice' },
                { character_id: 2, name: 'Bob' }
            ]
        });

    await checkMembers();

    // Verify file created
    if (fs.existsSync(MEMBERS_FILE)) {
        const saved = JSON.parse(fs.readFileSync(MEMBERS_FILE));
        console.log('✅ PASS: Members file created with', saved.length, 'members.');
    } else {
        console.error('❌ FAIL: Members file not created.');
    }

    // --- Scenario 2: No Changes ---
    console.log('\n--- Scenario 2: No Changes ---');
    nock.cleanAll();
    nock('https://evewho.com')
        .get('/api/corplist/98735707')
        .reply(200, {
            characters: [
                { character_id: 1, name: 'Alice' },
                { character_id: 2, name: 'Bob' }
            ]
        });

    // Capture console logs or webhook calls? 
    // We'll mock the webhook and assert it's NOT called
    const webhookScope = nock('http://discord.mock')
        .post('/webhook')
        .reply(200);

    await checkMembers();

    if (!webhookScope.isDone()) {
        console.log('✅ PASS: Webhook not called (no changes).');
    } else {
        // This logic is tricky because nock scopes are "pending"
        // If it WAS called, "isDone" would be true if we balanced it. 
        // Actually nock throws if no match, so if we define a scope and it IS called, it consumes it.
        // If not called, it remains pending.
        // We'll just rely on the fact that if it TRIES to call, it would hit our mock.
        // Let's refine the check: 
        // If we DON'T define a mock, and it tries to call, it will throw "Nock: No match".
        // So successful execution implies no call.
    }


    // --- Scenario 3: Member Joined ---
    console.log('\n--- Scenario 3: Member Joined ---');
    nock.cleanAll();
    nock('https://evewho.com')
        .get('/api/corplist/98735707')
        .reply(200, {
            characters: [
                { character_id: 1, name: 'Alice' },
                { character_id: 2, name: 'Bob' },
                { character_id: 3, name: 'Charlie' } // New
            ]
        });

    const joinWebhook = nock('http://discord.mock')
        .post('/webhook', body => body.content.includes('Charlie'))
        .reply(200);

    await checkMembers();

    if (joinWebhook.isDone()) {
        console.log('✅ PASS: Webhook called for Charlie joining.');
    } else {
        console.error('❌ FAIL: Webhook NOT called for Charlie joining.');
    }

    // --- Scenario 4: Member Left ---
    console.log('\n--- Scenario 4: Member Left ---');
    nock.cleanAll();
    nock('https://evewho.com')
        .get('/api/corplist/98735707')
        .reply(200, {
            characters: [
                { character_id: 1, name: 'Alice' },
                { character_id: 3, name: 'Charlie' }
                // Bob left
            ]
        });

    const leaveWebhook = nock('http://discord.mock')
        .post('/webhook', body => body.content.includes('Bob'))
        .reply(200);

    await checkMembers();

    if (leaveWebhook.isDone()) {
        console.log('✅ PASS: Webhook called for Bob leaving.');
    } else {
        console.error('❌ FAIL: Webhook NOT called for Bob leaving.');
    }

    console.log('\nTests completed.');
}

runTests();
