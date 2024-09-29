const axios = require('axios');
const chalk = require('chalk');
const fs = require('fs');
const { setIntervalAsync, clearIntervalAsync } = require('set-interval-async');
const { image } = require('./image');
const { resolve } = require('path');

// URL-encoded data processing
const url = 'https://notpx.app/api/v1';
const WAIT = 180 * 3;
const DELAY = 1000;
const WIDTH = 1000;
const HEIGHT = 1000;
const MAX_HEIGHT = 60;

let startX = 830;
let startY = 250;

// Color mapping
const colors = {
  '#': '#000000',
  '.': '#3690EA',
  '*': '#ffffff',
};

// Func to log messages with timestamp
function logMessage(message, color = chalk.reset) {
  const currentTime = new Date().toLocaleTimeString();
  console.log(`${chalk.gray(`[${currentTime}]`)} ${color(message)}`);
}

// Func to initialize axios instance with retry logic
function getSessionWithRetries() {
  const instance = axios.create({
    baseURL: url,
    timeout: 10000,
    retry: 3,
    retryDelay: 600,
  });

  return instance;
}

const session = getSessionWithRetries();

// Func to get pixel color from the server
async function getColor(pixel, headers) {
  try {
    const response = await session.get(`/image/get/${pixel}`, { headers });

    if (response.status === 401) {
      return -1;
    }

    return response.data.pixel.color;
  } catch (error) {
    logMessage(`Error fetching pixel color: ${error.message}`, chalk.red);

    return '#000000';
  }
}

// Func to claim resources from the server
async function claim(headers) {
  logMessage('Claiming resources', chalk.cyan);

  try {
    await session.get('/mining/claim', { headers });
  } catch (error) {
    logMessage(`Failed to claim resources: ${error.message}`, chalk.red);
  }
}

// Calculate pixel index based on x, y pos
function getPixel(x, y) {
  return y * WIDTH + x + 1;
}

// Get x, y pos from pixel index
function getPos(pixel) {
  return [pixel % WIDTH, Math.floor(pixel / WIDTH)];
}

// Get canvas pos
function getCanvasPos(x, y) {
  return getPixel(startX + x - 1, startY + y - 1);
}

// Perform painting action
async function paint(canvasPos, color, headers) {
  const data = {
    pixelId: canvasPos,
    newColor: color,
  };

  try {
    const response = await session.post('/repaint/start', data, { headers });
    const [x, y] = getPos(canvasPos);

    if (response.status === 400) {
      logMessage('Out of energy', chalk.red);

      return false;
    }

    if (response.status === 401) {
      return -1;
    }

    logMessage(`Paint: ${x}, ${y}`, chalk.green);

    return true;
  } catch (error) {
    logMessage(`Failed to paint: ${error.message}`, chalk.red);

    return false;
  }
}

// Extract username from URL-encoded init data
function extractUsernameFromInitData(initData) {
  const decodedData = decodeURIComponent(initData);
  const usernameStart = decodedData.indexOf('"username":"') + 12;
  const usernameEnd = decodedData.indexOf('"', usernameStart);

  if (usernameStart !== -1 && usernameEnd !== -1) {
    return decodedData.substring(usernameStart, usernameEnd);
  }

  return 'Unknown';
}

// Load accounts from data.txt file
function loadAccountsFromFile(filename) {
  const accounts = fs
    .readFileSync(filename, 'utf8')
    .split('\n')
    .map(line => `initData ${line.trim()}`);

  return accounts;
}

// Fetch mining data balance and stats
async function fetchMiningData(headers) {
  try {
    const response = await session.get('/mining/status', { headers });

    if (response.status === 200) {
      const data = response.data;
      logMessage(`Balance: ${data.userBalance}`, chalk.magenta);
    } else {
      logMessage(`Failed to fetch mining data: ${response.status}`, chalk.red);
    }
  } catch (error) {
    logMessage(`Error fetching mining data: ${error.message}`, chalk.red);
  }
}

// Main func to perform the painting process
async function main(auth) {
  const headers = { authorization: auth };

  try {
    // Fetch mining data before claiming resources
    await fetchMiningData(headers);

    // Claim resources
    await claim(headers);

    // Use the imported image
    const size = image.length * image[0].length;
    const order = [...Array(size).keys()];
    order.sort(() => Math.random() - 0.5);

    for (let posImage of order) {
      const [x, y] = getPos(posImage);
      await new Promise(resolve =>
        setTimeout(resolve, 50 + Math.random() * 100)
      );

      const color = await getColor(getCanvasPos(x, y), headers);

      if (color === -1) {
        logMessage('Dead :|', chalk.red);
        console.log(headers['authorization']);
        break;
      }

      if (image[y][x] === ' ' || color === colors[image[x][y]]) {
        logMessage(`Skip: ${startX + x - 1}, ${startY + y - 1}`, chalk.red);
        continue;
      }

      const result = await paint(
        getCanvasPos(x, y),
        colors[image[y][x]],
        headers
      );

      if (result === -1) {
        logMessage('Dead :|', chalk.red);
        console.log(headers['authorization']);
        break;
      } else if (!result) {
        break;
      }
    }
  } catch (error) {
    logMessage(`Network error: ${error.message}`, chalk.red);
  }
}

// Process accounts in sequence
async function processAccounts(accounts) {
  const firstAccountStartTime = new Date();

  for (let account of accounts) {
    const username = extractUsernameFromInitData(account);
    logMessage(
      `- - - Starting session for account: ${username} - - -`,
      chalk.blue
    );
    await main(account);
  }

  const timeElapsed = new Date() - firstAccountStartTime;
  const timeToWait = Math.max(3600000 - timeElapsed, 0);

  if (timeToWait > 0) {
    logMessage(
      `Sleeping for ${Math.floor(timeToWait / 60000)} minutes..`,
      chalk.yellow
    );
    await new Promise(resolve => setTimeout(resolve, timeToWait));
  } else {
    logMessage('No sleep needed', chalk.yellow);
  }
}

// Main loop to process accounts
(async () => {
  const accounts = loadAccountsFromFile('data.txt');

  while (true) {
    await processAccounts(accounts);
  }
})();
