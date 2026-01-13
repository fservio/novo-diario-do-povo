import crypto from 'node:crypto';

async function hashPassword(password) {
    const PBKDF2_ITERATIONS = 100000;
    const SALT_LENGTH = 16;
    const KEY_LENGTH = 32;
    const PBKDF2_PREFIX = 'pbkdf2_sha256$';

    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);

    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        passwordBuffer,
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
    );

    const derivedBits = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            hash: 'SHA-256',
            salt: salt,
            iterations: PBKDF2_ITERATIONS,
        },
        keyMaterial,
        KEY_LENGTH * 8
    );

    const derivedKey = new Uint8Array(derivedBits);

    function base64UrlEncode(buffer) {
        const bytes = Array.from(buffer)
        const binary = String.fromCharCode(...bytes)
        return btoa(binary)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '')
    }

    const saltEncoded = base64UrlEncode(salt);
    const keyEncoded = base64UrlEncode(derivedKey);

    return `${PBKDF2_PREFIX}${PBKDF2_ITERATIONS}$${saltEncoded}$${keyEncoded}`;
}

const email = 'fabioservio@gmail.com';
const password = 'Chevet92$';

import fs from 'node:fs';

hashPassword(password).then(hash => {
    const sql = `UPDATE users SET password_hash = '${hash}' WHERE email = '${email}';`;
    fs.writeFileSync('fix.sql', sql, 'utf8');
    console.log('SQL written to fix.sql');
});
