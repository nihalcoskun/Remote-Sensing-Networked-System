// gateway.js is the gateway between the sensors and the server

const net = require('net');
const dgram = require('dgram');
const udpServer = dgram.createSocket('udp4');
const tcpClient = new net.Socket();
const requestClient = dgram.createSocket('udp4');
const requestClientPort = 10002;
const tempSensorPort = 10000;
const humiditySensorPort = 10001;
const lastHumidityPort = 10004;
const serverAddress = '127.0.0.1';
const serverPort = 6000;

let lastTempTime = Date.now();
let lastAliveTime = Date.now();

tcpClient.connect(tempSensorPort, 'localhost', () => {
    console.log('Connected to temperature sensor');
});

tcpClient.on('data', (data) => {
    console.log('Received from temperature sensor: ' + data);
    lastTempTime = Date.now(); // Update the last received time

    const message = data.toString();
    const serverClient = new net.Socket();
    serverClient.connect(serverPort, serverAddress, () => {
        serverClient.write(message);
        serverClient.destroy();
    });

});



// UDP server for Humidity Sensor
udpServer.on('message', (message, rinfo) => {
    console.log(`Received from sensor: ${message} from ${rinfo.address}:${rinfo.port}`);

    const msg = message.toString();
    if (msg === 'ALIVE') {
        lastAliveTime = Date.now();
    } else {
        // Handle regular humidity data forwarding
        const serverClient = new net.Socket();
        serverClient.connect(serverPort, serverAddress, () => {
            serverClient.write(msg);
            serverClient.destroy();
        });
    }
});

udpServer.bind(humiditySensorPort);


requestClient.on('message', (message, rinfo) => {
    console.log(`Received from server req: ${message} from ${rinfo.address}:${rinfo.port}`);

    const msg = message.toString();
    if (msg === 'GET_LATEST_HUMIDITY') {
        // Send a request to the humidity sensor for the latest humidity value
        udpServer.send('REQUEST_LAST_HUMIDITY', lastHumidityPort, 'localhost');

        // Set up a one-time listener for the response
        udpServer.once('message', (msg) => {
            if (msg.toString().startsWith('LastHumidity')) {
                const humidityValue = msg.toString().split(':')[1].trim();
                const reply = `LastHumidity: ${humidityValue} Time: ${new Date().toISOString()}`;
                requestClient.send(reply, rinfo.port, rinfo.address);
            }
        });
    }

});

requestClient.bind(requestClientPort);

// Check every second if the humidity/temperature sensor is off
setInterval(() => {
    if (Date.now() - lastAliveTime > 7000) { // More than 7 seconds without ALIVE => alert
        console.log('HUMIDITY SENSOR OFF');

        const serverClient = new net.Socket();
        serverClient.connect(serverPort, serverAddress, () => {
            serverClient.write('Alert:HUMIDITY SENSOR OFF');
            serverClient.destroy();
        });
    }
    if (Date.now() - lastTempTime > 3000) { // // More than 3 seconds without data => alert
        console.log('TEMP SENSOR OFF');
        const serverClient = new net.Socket();
        serverClient.connect(serverPort, serverAddress, () => {
            serverClient.write('Alert:TEMP SENSOR OFF');
            serverClient.destroy();
        });

    }
}, 1000);

// shutdown
process.on('SIGINT', () => {
    udpServer.close();
    tcpClient.destroy();
    console.log('Gateway shutdown');
    process.exit();
});
