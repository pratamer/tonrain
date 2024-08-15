const fs = require('fs');
const path = require('path');
const axios = require('axios');
const colors = require('colors');
const readline = require('readline');
const { HttpsProxyAgent } = require('https-proxy-agent');

class Tone {
    constructor() {
        this.headers = {
            "Accept": "application/json, text/plain, */*",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://tonrain.org/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 Edg/127.0.0.0",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
        };
        this.proxies = this.loadProxies();
    }

    loadProxies() {
        const proxyFile = path.join(__dirname, 'proxy.txt');
        return fs.readFileSync(proxyFile, 'utf8')
            .replace(/\r/g, '')
            .split('\n')
            .filter(Boolean);
    }

    log(msg) {
        console.log(`[*] ${msg}`);
    }

    async waitWithCountdown(seconds) {
        for (let i = seconds; i >= 0; i--) {
            readline.cursorTo(process.stdout, 0);
            process.stdout.write(`===== Waiting ${i.toString().cyan} seconds to continue =====`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        console.log('');
    }

    async checkProxyIP(proxy) {
        try {
            const proxyAgent = new HttpsProxyAgent(proxy);
            const response = await axios.get('https://api.ipify.org?format=json', {
                httpsAgent: proxyAgent
            });
            if (response.status === 200) {
                return response.data.ip;
            } else {
                throw new Error(`Cannot check proxy IP. Status code: ${response.status}`);
            }
        } catch (error) {
            throw new Error(`Error when checking proxy IP: ${error.message}`);
        }
    }

    async getUserInfo(authorization, proxyAgent) {
        const url = "https://tonrain.org/server/login";
        const headers = { ...this.headers, "Authorization": `tma ${authorization}` };
        return axios.get(url, { headers, httpsAgent: proxyAgent });
    }

    async click(authorization, clicks, proxyAgent) {
        const url = `https://tonrain.org/server/clicks?clicks=${clicks}`;
        const headers = { ...this.headers, "Authorization": `tma ${authorization}` };
        return axios.get(url, { headers, httpsAgent: proxyAgent });
    }

    async performClicks(authorization, remainingClicks, proxyAgent) {
        while (remainingClicks > 0) {
            try {
                const clickResponse = await this.click(authorization, remainingClicks, proxyAgent);
                const { remainingClicks: newRemainingClicks, success } = clickResponse.data;

                if (success) {
                    this.log(`${'Click successful'.green}`);
                    this.log(`${'Remaining energy:'.magenta} ${newRemainingClicks.toString().cyan}`);

                    if (newRemainingClicks <= 10) {
                        this.log(`${'Low energy, switching account!'.yellow}`);
                        break;
                    }

                    remainingClicks = newRemainingClicks;
                } else {
                    this.log(`${'Click unsuccessful'.red}`);
                    break;
                }
            } catch (error) {
                console.log(`${'Error during clicks:'.red} ${error.message}`);
                break;
            }
        }
    }

    async main() {
        const dataFile = path.join(__dirname, 'data.txt');
        const data = fs.readFileSync(dataFile, 'utf8')
            .replace(/\r/g, '')
            .split('\n')
            .filter(Boolean);
        while (true) {
            for (let no = 0; no < data.length; no++) {
                const authorization = data[no];
                const proxy = this.proxies[no];
                const proxyAgent = new HttpsProxyAgent(proxy);

                try {
                    let proxyIP = "Unknown";
                    try {
                        proxyIP = await this.checkProxyIP(proxy);
                    } catch (proxyError) {
                        console.log(`${'Error checking proxy IP:'.yellow} ${proxyError.message}`);
                    }

                    const userInfoResponse = await this.getUserInfo(authorization, proxyAgent);
                    const { username, balance, remainingClicks, clicksPerTap, limitEnergy } = userInfoResponse.data.userData;

                    const formattedBalance = (parseFloat(balance) / 1000000000).toFixed(6);

                    console.log(`========== Account ${(no + 1).toString().cyan} | ${username.green} | IP: ${proxyIP.cyan} ==========`);
                    this.log(`${'Balance:'.magenta} ${formattedBalance.toString().cyan}`);
                    this.log(`${'Clicks per Tap:'.magenta} ${clicksPerTap.toString().cyan}`);
                    this.log(`${'Energy:'.magenta} ${remainingClicks.toString().cyan} / ${limitEnergy.toString().cyan}`);

                    await this.performClicks(authorization, remainingClicks, proxyAgent);

                } catch (error) {
                    console.log(`${'=========='.yellow} Account ${(no + 1).toString().cyan} | ${'Error'.red} ==========`);
                    if (error.response) {
                        console.log(`${'Status:'.red} ${error.response.status}`);
                        console.log(`${'Message:'.red} ${JSON.stringify(error.response.data)}`);
                    } else if (error.request) {
                        console.log('No response received from server'.red);
                    } else {
                        console.log(`${'Error:'.red} ${error.message}`);
                    }
                    console.log(`${'Authorization:'.red} ${authorization}`);
                }
            }
            await this.waitWithCountdown(60);
        }
    }
}

if (require.main === module) {
    const tone = new Tone();
    tone.main().catch(err => {
        console.error(err.toString().red);
        process.exit(1);
    });
}
