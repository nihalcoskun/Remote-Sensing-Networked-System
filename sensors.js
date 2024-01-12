// sensors.js - Simulate a temperature and humidity sensor
const net = require('net');
const dgram = require('dgram');
const udpClient = dgram.createSocket('udp4');
const tcpServer = net.createServer();
const udpServer = dgram.createSocket('udp4');
const tempPort = 10000;  // TCP Port for (Temperature Sensor)
const humidityPort = 10001; // UDP Port for (Humidity Sensor)
const lastHumidityPort = 10004; // UDP Port for (Last Humidity Request)
const gatewayAddress = '127.0.0.1';

let lastHumidityValue = null; // Last humidity value generated

// Temperature Sensor (TCP)
tcpServer.on('connection', (socket) => {
    console.log('Temperature sensor connected');
    setInterval(() => {
        const temperature = 20 + Math.random() * 10;
        const message = `Temperature: ${temperature.toFixed(1)} Time: ${new Date().toISOString()}`;
        console.log(`Sending: ${message}`);
        socket.write(message);
    }, 1000);
});

tcpServer.listen(tempPort, () => {
    console.log(`Temperature sensor running on TCP port ${tempPort}`);
});

// Humidity Sensor via (UDP)
setInterval(() => {
    const humidity = 40 + Math.random() * 50;
    lastHumidityValue = humidity; // Save the last value generated
    if (humidity > 80) {
        const message = `Humidity: ${humidity.toFixed(1)} Time: ${new Date().toISOString()}`;
        console.log(`Sending: ${message}`);
        udpClient.send(message, humidityPort, gatewayAddress);
    }
}, 1000);

setInterval(() => {
    const aliveMessage = 'ALIVE'; // Alive message every 3 seconds
    console.log(`Sending: ${aliveMessage}`);
    udpClient.send(aliveMessage, humidityPort, gatewayAddress);
}, 3000);

// Listen for a request from the gateway
udpServer.on('message', (msg, rinfo) => {
    if (msg.toString() === 'REQUEST_LAST_HUMIDITY') {
        console.log('Last humidity requested');
        if (lastHumidityValue !== null) {
            const reply = `LastHumidity: ${lastHumidityValue.toFixed(1)} Time: ${new Date().toISOString()}`;
            udpClient.send(reply, rinfo.port, rinfo.address);
        }
    }
});

udpServer.bind(lastHumidityPort, () => {
    console.log(`Last humidity request server running on UDP port ${lastHumidityPort}`);
});


process.on('SIGINT', () => {
    udpClient.close();
    tcpServer.close();
    console.log('Sensors shutdown');
    process.exit();
});
