require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const userAgent = 'EveMemberWebhook/1.0 (github.com/dustify/eve-member-webhook)';

const DATA_DIR = path.join(__dirname, '../data');
const MEMBERS_FILE = path.join(DATA_DIR, 'members.json');

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

function getConfig() {
    return {
        discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL,
        checkInterval: parseInt(process.env.CHECK_INTERVAL_MS || '3600000', 10),
        corpId: process.env.CORP_ID || '98735707'
    };
}

async function fetchMembers(corpId) {
    try {
        const response = await axios.get(`https://evewho.com/api/corplist/${corpId}`, {
            headers: {
                'User-Agent': userAgent
            }
        });
        // The API returns { characters: [ { character_id, name }, ... ] }
        if (response.data && response.data.characters) {
            return response.data.characters;
        }
        return [];
    } catch (error) {
        console.error('Error fetching members:', error.message);
        return null;
    }
}

function loadPreviousMembers() {
    if (!fs.existsSync(MEMBERS_FILE)) {
        return null; // Return null to indicate first run
    }
    try {
        const data = fs.readFileSync(MEMBERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading members file:', error.message);
        return [];
    }
}

function saveMembers(members) {
    try {
        fs.writeFileSync(MEMBERS_FILE, JSON.stringify(members, null, 2));
    } catch (error) {
        console.error('Error saving members file:', error.message);
    }
}

async function sendDiscordWebhook(content) {
    const { discordWebhookUrl } = getConfig();
    if (!discordWebhookUrl || discordWebhookUrl === 'your_webhook_url_here') {
        console.log('Discord Webhook URL not configured, skipping notification:', content);
        return;
    }

    try {
        await axios.post(discordWebhookUrl, { content }, {
            headers: {
                'User-Agent': userAgent
            }
        });
        console.log('Sent Discord notification:', content);
    } catch (error) {
        console.error('Error sending Discord webhook:', error.message);
    }
}

async function checkMembers() {
    const { corpId } = getConfig();
    console.log(`Checking members for corp ${corpId}...`);
    const currentMembers = await fetchMembers(corpId);

    if (!currentMembers) {
        console.log('Failed to fetch members, skipping this check.');
        return;
    }

    const previousMembers = loadPreviousMembers();

    if (previousMembers === null) {
        console.log('First run. saving current member list.');
        saveMembers(currentMembers);
        return;
    }

    // Create maps for easier lookup
    const currentMap = new Map(currentMembers.map(m => [m.character_id, m.name]));
    const previousMap = new Map(previousMembers.map(m => [m.character_id, m.name]));

    const joined = currentMembers.filter(m => !previousMap.has(m.character_id));
    const left = previousMembers.filter(m => !currentMap.has(m.character_id));

    if (joined.length > 0) {
        console.log(`${joined.length} members joined.`);
        for (const member of joined) {
            await sendDiscordWebhook(`**${member.name}** has joined the corporation.`);
        }
    }

    if (left.length > 0) {
        console.log(`${left.length} members left.`);
        for (const member of left) {
            await sendDiscordWebhook(`**${member.name}** has left the corporation.`);
        }
    }

    if (joined.length > 0 || left.length > 0) {
        saveMembers(currentMembers);
    } else {
        console.log('No changes detected.');
    }
}

// Start the loop if run directly
if (require.main === module) {
    console.log('Starting EVE Member Webhook Monitor...');
    const { checkInterval } = getConfig();
    console.log(`Check Interval: ${checkInterval}ms`);

    ensureDataDir();

    // Run immediately on start
    checkMembers();

    // Then run on interval
    setInterval(checkMembers, checkInterval);
}

module.exports = {
    checkMembers,
    fetchMembers,
    loadPreviousMembers,
    saveMembers,
    sendDiscordWebhook,
    ensureDataDir
};
