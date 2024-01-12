// server.js - The server that receives data from the gateway and stores it in a log file and displays it on a web page
const dgram = require('dgram');
const cluster = require('cluster');
const http = require('http');
const net = require('net');
const fs = require('fs');
const numCPUs = require('os').cpus().length; // for multithreading

const serverPort = 6000; //  gateway
const webPort = 8080; //  web interface

if (cluster.isMaster) {
    console.log(`Master ${process.pid} is running`); //  master process 

    // Fork workers
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker) => {
        console.log(`worker ${worker.process.pid} died`);
    });
} else {
    console.log(`Worker ${process.pid} started`); //  worker processes
    let temperatureData = [];
    let humidityData = [];

    const tcpServer = net.createServer((socket) => {
        socket.on('data', (data) => {
            console.log('Received: ' + data);
            const message = data.toString();
            const now = new Date();

            if (message.startsWith('Temperature')) {
                temperatureData.push({ value: parseFloat(message.split(':')[1]), timestamp: now.toISOString() });
            }
            else if (message.startsWith('Humidity')) {
                humidityData.push({ value: parseFloat(message.split(':')[1]), timestamp: now.toISOString() });
            } else if (message.startsWith('Alert')) {
                console.log('ALERT RECEIVED: ' + message.split(':')[1]);
            } else if (message.startsWith('LastHumidity')) {
                const humidity = parseFloat(message.split(':')[1]);
                humidityData.push({ value: humidity });
                console.log(`Last humidity value: ${humidity}`);
            }
            else {
                console.log('Unknown message type');
            }
            // Logging
            if (message.startsWith('LastHumidity') === false) { // this is to not log the last humidity value which could be smaller than 80
                fs.appendFile('server.log', `${now.toISOString()} - ${message}\n`, (err) => {
                    if (err) throw err;
                });
            }
        });
    });

    tcpServer.listen(serverPort, () => {
        console.log(`Server listening for gateway connections on port ${serverPort}`);
    });

    const webServer = http.createServer((req, res) => {
        if (req.url === '/temperature') {
            try {
                const data = fs.readFileSync('server.log', 'utf8');
                const logEntries = data.trim().split('\n');
                const temperatureEntries = logEntries.filter(entry => entry.includes('Temperature'));

                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.write('<html><body><h1>Temperature Data</h1>');

                temperatureEntries.forEach(entry => {
                    const [timestamp, message] = entry.split(' - ');
                    const tempValue = message.split(' ')[1];
                    res.write(`<p>${timestamp}: ${tempValue}°C</p>`);
                });
                res.end('</body></html>');
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('500 - Internal Server Error');
                console.error('Error reading server.log:', err);
            }
        } else if (req.url === '/humidity') {
            try {
                const data = fs.readFileSync('server.log', 'utf8');
                const logEntries = data.trim().split('\n');
                const humidityEntries = logEntries.filter(entry => entry.includes('Humidity'));

                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.write('<html><body><h1>Humidity Data</h1>');

                humidityEntries.forEach(entry => {
                    const [timestamp, message] = entry.split(' - ');
                    const humValue = message.split(' ')[1];
                    res.write(`<p>${timestamp}: ${humValue}%</p>`);
                });
                res.end('</body></html>');
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('500 - Internal Server Error');
                console.error('Error reading server.log:', err);
            }
        } else if (req.url === '/gethumidity') {

            // Send a request to the gateway for the latest humidity value
            const udpClient = dgram.createSocket('udp4');
            udpClient.send('GET_LATEST_HUMIDITY', 10002, 'localhost');

            // Set up a one-time listener for the response
            udpClient.once('message', (msg) => {
                if (msg.toString().startsWith('LastHumidity')) {
                    console.log('Last humidity received');

                    const parts = msg.toString().split(' ');
                    const humidityValue = parts[1]; // The value after 'LastHumidity:'
                    const timestamp = parts.slice(3).join(' ');
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.write('<html><body><h1>Latest Humidity Value</h1>');
                    res.write(`<p>Latest Humidity: ${humidityValue}% ${timestamp}</p>`);
                    res.end('</body></html>');
                }
            });
        }

        else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
        }
    });

    webServer.listen(webPort, () => {
        console.log(`Web server running on http://localhost:${webPort}`);
    });

    // shutdown
    process.on('SIGINT', () => {
        tcpServer.close();
        webServer.close();
        console.log('Server shutdown');
        process.exit();
    });
}
