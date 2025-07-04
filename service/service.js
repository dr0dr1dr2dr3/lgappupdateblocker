const pkgInfo = require('./package.json');
const Service = require('webos-service');
var fs = require('fs');
var path = require('path');

function ensureDirectoryExistence(filePath) {
    var dirname = path.dirname(filePath);
    if (fs.existsSync(dirname)) {
        return true;
    }
    ensureDirectoryExistence(dirname);
    fs.mkdirSync(dirname);
}

const service = new Service(pkgInfo.name);

service.register('hello', function(message) {
    console.log('Hello method called');
    
    message.respond({
        returnValue: true,
        response: 'world'
    });
});

service.register('/hello', function(message) {
    console.log('/hello method called');
    
    message.respond({
        returnValue: true,
        response: 'world'
    });
});

const UPDATE_INFO_PATH = '/mnt/lg/cmn_data/var/palm/data/com.webos.appInstallService/updateInfo';

service.register('readUpdateInfo', function(message) {
    try {
        if (fs.existsSync(UPDATE_INFO_PATH)) {
            const content = fs.readFileSync(UPDATE_INFO_PATH, 'utf8');
            message.respond({
                returnValue: true,
                content: content
            });
        } else {
            message.respond({
                returnValue: true,
                content: ''
            });
        }
    } catch (error) {
        message.respond({
            returnValue: false,
            errorText: error.message
        });
    }
});

service.register('clearUpdateInfo', function(message) {
    try {
        if (fs.existsSync(UPDATE_INFO_PATH)) {
            fs.writeFileSync(UPDATE_INFO_PATH, '[]');
            message.respond({
                returnValue: true,
                message: 'Update info cleared successfully - hard restart your TV to apply changes (unplug it or use reboot over ssh)'
            });
        } else {
            message.respond({
                returnValue: true,
                message: 'Update info file does not exist'
            });
        }
    } catch (error) {
        message.respond({
            returnValue: false,
            errorText: error.message
        });
    }
});

var autostartScript = 
`#!/bin/sh

output=$(luna-send -n 1 "luna://org.webosbrew.appupdateblocker.service/addUpdateDomains" \'{}\')

if echo "$output" | grep -q \'status unknown\'; then
	/var/lib/webosbrew/init.d/appupdateblocker &
	exit
fi

if echo "$output" | grep -q \'errorText\'; then
	rm -f /var/lib/webosbrew/init.d/appupdateblocker
fi`;

const PERSISTENT_SCRIPT_PATH = '/var/lib/webosbrew/init.d/appupdateblocker';

service.register('checkPersistentScript', function(message) {
    try {
        const exists = fs.existsSync(PERSISTENT_SCRIPT_PATH);
        message.respond({
            returnValue: true,
            exists: exists
        });
    } catch (error) {
        message.respond({
            returnValue: false,
            errorText: error.message
        });
    }
});

service.register('installPersistentScript', function(message) {
    try {
        if (fs.existsSync(PERSISTENT_SCRIPT_PATH)) {
            message.respond({
                returnValue: false,
                errorText: "Persistent script already exists"
            });
            return;
        }
        
        ensureDirectoryExistence(PERSISTENT_SCRIPT_PATH);
        fs.writeFileSync(PERSISTENT_SCRIPT_PATH, autostartScript);
        fs.chmodSync(PERSISTENT_SCRIPT_PATH, '755');
        message.respond({
            returnValue: true,
            message: "Persistent script installed successfully"
        });
    } catch (error) {
        message.respond({
            returnValue: false,
            errorText: error.message
        });
    }
});

service.register('removePersistentScript', function(message) {
    try {
        if (fs.existsSync(PERSISTENT_SCRIPT_PATH)) {
            fs.unlinkSync(PERSISTENT_SCRIPT_PATH);
            message.respond({
                returnValue: true,
                message: "Persistent script removed successfully"
            });
        } else {
            message.respond({
                returnValue: true,
                message: "Persistent script does not exist"
            });
        }
    } catch (error) {
        message.respond({
            returnValue: false,
            errorText: error.message
        });
    }
});

// Keep the original autoblock for backwards compatibility
service.register('autoblock', function(message) {
	try {
		ensureDirectoryExistence('/var/lib/webosbrew/init.d/appupdateblocker');
		fs.writeFileSync('/var/lib/webosbrew/init.d/appupdateblocker', autostartScript);
		fs.chmodSync('/var/lib/webosbrew/init.d/appupdateblocker', '755');
		message.respond({
			"returnValue": true,
			"response": "Created appupdateblocker script."
		});
	} catch (error) {
		message.respond({
			"returnValue": false,
			"errorText": error.stack
		});
	}
});

const HOSTS_FILE_PATH = '/etc/hosts';
const UPDATE_DOMAINS_FILE = path.join(__dirname, 'lg_update_domains.txt');

service.register('checkHostsStatus', function(message) {
    try {
        const hostsContent = fs.readFileSync(HOSTS_FILE_PATH, 'utf8');
        const lgtvsdpCount = (hostsContent.match(/lgtvsdp\.com/g) || []).length;
        
        message.respond({
            returnValue: true,
            blockedDomainsCount: lgtvsdpCount
        });
    } catch (error) {
        message.respond({
            returnValue: false,
            errorText: error.message
        });
    }
});

service.register('addUpdateDomains', function(message) {
    try {
        // Read the update domains file
        const updateDomains = fs.readFileSync(UPDATE_DOMAINS_FILE, 'utf8')
            .split('\n')
            .filter(line => line.trim())
            .map(domain => domain.trim());
        
        // Read current hosts file
        let hostsContent = fs.readFileSync(HOSTS_FILE_PATH, 'utf8');
        
        // Add domains that aren't already in the hosts file
        let addedCount = 0;
        const hostsEntries = updateDomains.map(domain => {
            if (!hostsContent.includes(domain)) {
                addedCount++;
                return `0.0.0.0 ${domain}`;
            }
            return null;
        }).filter(entry => entry !== null);
        
        if (hostsEntries.length > 0) {
            // Ensure hosts file ends with newline
            if (!hostsContent.endsWith('\n')) {
                hostsContent += '\n';
            }
            
            // Add header and entries
            hostsContent += '\n# LG App Update Blocker - Update domains\n';
            hostsContent += hostsEntries.join('\n');
            hostsContent += '\n';
            
            // Write back to hosts file
            fs.writeFileSync(HOSTS_FILE_PATH, hostsContent);
        }
        
        message.respond({
            returnValue: true,
            message: `Added ${addedCount} update domains to hosts file`,
            addedCount: addedCount
        });
    } catch (error) {
        message.respond({
            returnValue: false,
            errorText: error.message
        });
    }
});

service.register('removeUpdateDomains', function(message) {
    try {
        // Read current hosts file
        let hostsContent = fs.readFileSync(HOSTS_FILE_PATH, 'utf8');
        
        // Split into lines and filter out lgtvsdp.com lines
        const lines = hostsContent.split('\n');
        const filteredLines = lines.filter(line => !line.includes('lgtvsdp.com'));
        const removedCount = lines.length - filteredLines.length;
        
        // Write back to hosts file
        fs.writeFileSync(HOSTS_FILE_PATH, filteredLines.join('\n'));
        
        message.respond({
            returnValue: true,
            message: `Removed ${removedCount} update domains from hosts file`,
            removedCount: removedCount
        });
    } catch (error) {
        message.respond({
            returnValue: false,
            errorText: error.message
        });
    }
});

const SSH_KEYS_PATH = '/home/root/.ssh/authorized_keys';

service.register('listSSHKeys', function(message) {
    try {
        // Check if .ssh directory exists
        if (!fs.existsSync('/home/root/.ssh')) {
            message.respond({
                returnValue: true,
                keys: [],
                count: 0,
                message: "No SSH directory found"
            });
            return;
        }
        
        // Check if authorized_keys file exists
        if (!fs.existsSync(SSH_KEYS_PATH)) {
            message.respond({
                returnValue: true,
                keys: [],
                count: 0,
                message: "No authorized_keys file found"
            });
            return;
        }
        
        // Read the authorized_keys file
        const content = fs.readFileSync(SSH_KEYS_PATH, 'utf8');
        const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
        
        // Parse keys to extract key type and comment
        const keys = lines.map(line => {
            const parts = line.trim().split(' ');
            if (parts.length >= 2) {
                return {
                    type: parts[0],
                    key: parts[1].substring(0, 20) + '...',  // Show first 20 chars of key
                    comment: parts[2] || 'no comment'
                };
            }
            return null;
        }).filter(key => key !== null);
        
        message.respond({
            returnValue: true,
            keys: keys,
            count: keys.length
        });
    } catch (error) {
        message.respond({
            returnValue: false,
            errorText: error.message
        });
    }
});

service.register('clearSSHKeys', function(message) {
    try {
        // Check if .ssh directory exists
        if (!fs.existsSync('/home/root/.ssh')) {
            message.respond({
                returnValue: true,
                message: "No SSH directory found, nothing to clear"
            });
            return;
        }
        
        // Check if authorized_keys file exists
        if (!fs.existsSync(SSH_KEYS_PATH)) {
            message.respond({
                returnValue: true,
                message: "No authorized_keys file found, nothing to clear"
            });
            return;
        }
        
        // Clear the file by writing empty content
        fs.writeFileSync(SSH_KEYS_PATH, '');
        
        message.respond({
            returnValue: true,
            message: "SSH keys cleared successfully"
        });
    } catch (error) {
        message.respond({
            returnValue: false,
            errorText: error.message
        });
    }
});

service.register('addSSHKey', function(message) {
    try {
        const sshKey = message.payload.key;
        
        if (!sshKey || sshKey.trim() === '') {
            message.respond({
                returnValue: false,
                errorText: "SSH key cannot be empty"
            });
            return;
        }
        
        // Validate SSH key format (basic check)
        const keyParts = sshKey.trim().split(' ');
        if (keyParts.length < 2 || !['ssh-rsa', 'ssh-ed25519', 'ecdsa-sha2-nistp256', 'ssh-dss'].includes(keyParts[0])) {
            message.respond({
                returnValue: false,
                errorText: "Invalid SSH key format. Key should start with ssh-rsa, ssh-ed25519, etc."
            });
            return;
        }
        
        // Ensure .ssh directory exists
        const sshDir = '/home/root/.ssh';
        if (!fs.existsSync(sshDir)) {
            fs.mkdirSync(sshDir, { recursive: true, mode: 0o700 });
        }
        
        // Read existing keys
        let existingKeys = '';
        if (fs.existsSync(SSH_KEYS_PATH)) {
            existingKeys = fs.readFileSync(SSH_KEYS_PATH, 'utf8');
        }
        
        // Check if key already exists
        if (existingKeys.includes(keyParts[1])) {
            message.respond({
                returnValue: false,
                errorText: "This SSH key already exists"
            });
            return;
        }
        
        // Append the new key
        const newKey = sshKey.trim() + '\n';
        fs.appendFileSync(SSH_KEYS_PATH, newKey);
        
        // Set proper permissions
        fs.chmodSync(SSH_KEYS_PATH, 0o600);
        
        message.respond({
            returnValue: true,
            message: "SSH key added successfully"
        });
    } catch (error) {
        message.respond({
            returnValue: false,
            errorText: error.message
        });
    }
});