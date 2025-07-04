import "webostvjs/webOSTV";

const responseEl = document.getElementById('response');
const updateInfoEl = document.getElementById('updateInfoContent');
const refreshBtn = document.getElementById('refreshUpdateInfo');
const clearBtn = document.getElementById('clearUpdateInfo');
const hostsStatusEl = document.getElementById('hostsStatus');
const addDomainsBtn = document.getElementById('addUpdateDomains');
const removeDomainsBtn = document.getElementById('removeUpdateDomains');
const persistentStatusEl = document.getElementById('persistentScriptStatus');
const installPersistentBtn = document.getElementById('installPersistentScript');
const removePersistentBtn = document.getElementById('removePersistentScript');
const sshKeysContentEl = document.getElementById('sshKeysContent');
const refreshSSHKeysBtn = document.getElementById('refreshSSHKeys');
const clearSSHKeysBtn = document.getElementById('clearSSHKeys');
const sshKeyInput = document.getElementById('sshKeyInput');
const addSSHKeyBtn = document.getElementById('addSSHKey');
let serviceElevated = false;

function showMessage(message, isError = false) {
    responseEl.className = isError ? 'response error' : 'response';
    responseEl.innerText = message;
    responseEl.style.display = 'block';
    setTimeout(() => {
        responseEl.style.display = 'none';
    }, 5000);
}

function formatUpdateInfo(content) {
    if (!content) return '<p>No blocked apps</p>';
    
    try {
        const data = JSON.parse(content);
        if (!Array.isArray(data) || data.length === 0) {
            return '<p>No blocked apps</p>';
        }
        
        // Apps are blocked - create a formatted list
        const appIds = data.map(app => app.id).filter(id => id);
        const listItems = appIds.map(id => `<li>${id}</li>`).join('');
        
        const html = '<div class="blocked-apps-warning">Apps blocked until update:</div>' +
                    '<ul style="margin-top: 10px; padding-left: 20px;">' + listItems + '</ul>';
        return html;
    } catch (e) {
        return '<p>Error parsing blocked apps data</p>';
    }
}

function enableButtons() {
    refreshBtn.disabled = false;
    clearBtn.disabled = false;
    addDomainsBtn.disabled = false;
    removeDomainsBtn.disabled = false;
    installPersistentBtn.disabled = false;
    removePersistentBtn.disabled = false;
    refreshSSHKeysBtn.disabled = false;
    clearSSHKeysBtn.disabled = false;
    sshKeyInput.disabled = false;
    addSSHKeyBtn.disabled = false;
    serviceElevated = true;
}

function checkHostsStatus() {
    webOS.service.request("luna://org.webosbrew.appupdateblocker.service", {
        method: "checkHostsStatus",
        parameters: {},
        onSuccess: function (res) {
            if (res.blockedDomainsCount > 0) {
                hostsStatusEl.innerText = `${res.blockedDomainsCount} update domains are currently blocked`;
                hostsStatusEl.style.color = 'var(--success-color)';  // Green - good!
                if (serviceElevated) {
                    addDomainsBtn.disabled = true;
                    removeDomainsBtn.disabled = false;
                }
            } else {
                hostsStatusEl.innerText = 'No update domains are currently blocked';
                hostsStatusEl.style.color = 'var(--error-color)';  // Red - bad!
                if (serviceElevated) {
                    addDomainsBtn.disabled = false;
                    removeDomainsBtn.disabled = true;
                }
            }
        },
        onFailure: function (error) {
            hostsStatusEl.innerText = 'Failed to check hosts file status';
            hostsStatusEl.style.color = 'var(--error-color)';
        }
    });
}

function checkPersistentScript() {
    webOS.service.request("luna://org.webosbrew.appupdateblocker.service", {
        method: "checkPersistentScript",
        parameters: {},
        onSuccess: function (res) {
            if (res.exists) {
                persistentStatusEl.innerText = 'Persistent script is installed';
                persistentStatusEl.style.color = 'var(--success-color)';  // Green - good!
                if (serviceElevated) {
                    installPersistentBtn.disabled = true;
                    removePersistentBtn.disabled = false;
                }
            } else {
                persistentStatusEl.innerText = 'Persistent script is not installed';
                persistentStatusEl.style.color = 'var(--error-color)';  // Red - bad!
                if (serviceElevated) {
                    installPersistentBtn.disabled = false;
                    removePersistentBtn.disabled = true;
                }
            }
        },
        onFailure: function (error) {
            persistentStatusEl.innerText = 'Failed to check persistent script status';
            persistentStatusEl.style.color = 'var(--error-color)';
        }
    });
}

function loadSSHKeys() {
    webOS.service.request("luna://org.webosbrew.appupdateblocker.service", {
        method: "listSSHKeys",
        parameters: {},
        onSuccess: function (res) {
            if (res.count === 0) {
                sshKeysContentEl.innerHTML = '<p>No SSH keys found</p>';
                if (serviceElevated) {
                    clearSSHKeysBtn.disabled = true;
                }
            } else {
                const keysList = res.keys.map(key => 
                    `<li><strong>${key.type}</strong>: ${key.key} <em>(${key.comment})</em></li>`
                ).join('');
                sshKeysContentEl.innerHTML = `<p>Found ${res.count} SSH key(s):</p><ul style="margin: 10px 0; padding-left: 20px;">${keysList}</ul>`;
                if (serviceElevated) {
                    clearSSHKeysBtn.disabled = false;
                }
            }
        },
        onFailure: function (error) {
            sshKeysContentEl.innerHTML = '<p>Failed to load SSH keys: ' + error.errorText + '</p>';
        }
    });
}

function loadUpdateInfo() {
    webOS.service.request("luna://org.webosbrew.appupdateblocker.service", {
        method: "readUpdateInfo",
        parameters: {},
        onSuccess: function (res) {
            updateInfoEl.innerHTML = formatUpdateInfo(res.content);
            // Enable/disable clear button based on whether there are blocked apps
            if (serviceElevated && res.content) {
                try {
                    const data = JSON.parse(res.content);
                    clearBtn.disabled = !data || data.length === 0;
                } catch (e) {
                    clearBtn.disabled = true;
                }
            }
        },
        onFailure: function (error) {
            updateInfoEl.innerHTML = "<p>Failed to read blocked apps status: " + error.errorText + "</p>";
        }
    });
}

console.log("Checking for root...");
webOS.service.request("luna://org.webosbrew.hbchannel.service", {
    method: "getConfiguration",
    parameters: {},
    onSuccess: function (config) {
        console.log(JSON.stringify(config));
        if (config.root) {
            console.log("Homebrew channel is elevated, attempting to elevate service...");
            webOS.service.request("luna://org.webosbrew.hbchannel.service", {
                method: "exec",
                parameters: {"command": "/media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/elevate-service org.webosbrew.appupdateblocker.service"},
                onSuccess: function (response) {
                    console.log("Service is elevated!");
                    showMessage("Service elevated successfully");
                    enableButtons();
                    loadUpdateInfo();
                    checkHostsStatus();
                    checkPersistentScript();
                    loadSSHKeys();
                },
                onFailure: function (error) {
                    console.log("Failed to elevate service!");
                    console.log("[" + error.errorCode + "]: " + error.errorText);
                    showMessage("Failed to elevate service: " + error.errorText, true);
                    return;
                }
            });
        } else {
            console.log("Cannot elevate service.");
            console.log("Homebrew channel must have root!");
            showMessage("Homebrew channel must have root!", true);
        }
    },
    onFailure: function (error) {
        console.log("Failed to check for root! Do you have the homebrew channel installed? Are you rooted? The root status in the homebrew channel settings needs to say ok.");
        console.log("[" + error.errorCode + "]: " + error.errorText);
        showMessage("Failed to check for root: " + error.errorText, true);
        return;
    }
});


document.getElementById('refreshUpdateInfo').onclick = function() {
    updateInfoEl.innerHTML = '<p>Loading...</p>';
    loadUpdateInfo();
}

document.getElementById('clearUpdateInfo').onclick = function() {
    webOS.service.request("luna://org.webosbrew.appupdateblocker.service", {
        method: "clearUpdateInfo",
        parameters: {},
        onSuccess: function (res) {
            showMessage(res.message);
            loadUpdateInfo();
        },
        onFailure: function (error) {
            showMessage("Failed to remove forced update apps: " + error.errorText, true);
        }
    });
}

document.getElementById('addUpdateDomains').onclick = function() {
    webOS.service.request("luna://org.webosbrew.appupdateblocker.service", {
        method: "addUpdateDomains",
        parameters: {},
        onSuccess: function (res) {
            showMessage(res.message);
            checkHostsStatus();
        },
        onFailure: function (error) {
            showMessage("Failed to add update domains: " + error.errorText, true);
        }
    });
}

document.getElementById('removeUpdateDomains').onclick = function() {
    webOS.service.request("luna://org.webosbrew.appupdateblocker.service", {
        method: "removeUpdateDomains",
        parameters: {},
        onSuccess: function (res) {
            showMessage(res.message);
            checkHostsStatus();
        },
        onFailure: function (error) {
            showMessage("Failed to remove update domains: " + error.errorText, true);
        }
    });
}

document.getElementById('installPersistentScript').onclick = function() {
    webOS.service.request("luna://org.webosbrew.appupdateblocker.service", {
        method: "installPersistentScript",
        parameters: {},
        onSuccess: function (res) {
            showMessage(res.message);
            checkPersistentScript();
        },
        onFailure: function (error) {
            showMessage("Failed to install persistent script: " + error.errorText, true);
        }
    });
}

document.getElementById('removePersistentScript').onclick = function() {
    webOS.service.request("luna://org.webosbrew.appupdateblocker.service", {
        method: "removePersistentScript",
        parameters: {},
        onSuccess: function (res) {
            showMessage(res.message);
            checkPersistentScript();
        },
        onFailure: function (error) {
            showMessage("Failed to remove persistent script: " + error.errorText, true);
        }
    });
}

document.getElementById('refreshSSHKeys').onclick = function() {
    sshKeysContentEl.innerHTML = '<p>Loading...</p>';
    loadSSHKeys();
}

document.getElementById('clearSSHKeys').onclick = function() {
    if (confirm('Are you sure you want to clear all SSH keys? This will remove root SSH access.')) {
        webOS.service.request("luna://org.webosbrew.appupdateblocker.service", {
            method: "clearSSHKeys",
            parameters: {},
            onSuccess: function (res) {
                showMessage(res.message);
                loadSSHKeys();
            },
            onFailure: function (error) {
                showMessage("Failed to clear SSH keys: " + error.errorText, true);
            }
        });
    }
}

document.getElementById('addSSHKey').onclick = function() {
    const sshKey = sshKeyInput.value.trim();
    
    if (!sshKey) {
        showMessage("Please enter an SSH key", true);
        return;
    }
    
    webOS.service.request("luna://org.webosbrew.appupdateblocker.service", {
        method: "addSSHKey",
        parameters: {
            key: sshKey
        },
        onSuccess: function (res) {
            showMessage(res.message);
            sshKeyInput.value = '';  // Clear the input
            loadSSHKeys();  // Refresh the key list
        },
        onFailure: function (error) {
            showMessage("Failed to add SSH key: " + error.errorText, true);
        }
    });
}