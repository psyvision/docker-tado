/*jshint esnext: true */
/* jshint node: true */

'use strict';

var tado = require('node-tado').Client;
var moment = require('moment');
var winston = require('winston');
winston.level = 'debug';

// Authentication via ENV variables
const auth = {
    login: process.env.TADO_LOGIN,
    password: process.env.TADO_PASSWORD
};

// InfluxDB
//const DB_HOST = 'elcap.ddns.net';
const DB_HOST = 'localhost';
const DB_NAME = 'tado';

var Influx = require('influx');
const influx = new Influx.InfluxDB({
    host: DB_HOST,
});

const logInterval = 10*60*1000; /* logging interval in ms */
var homeId;
var home;
var zones;

/* Misc functions */

function authorize(login, pass) {
    return new Promise((resolve, reject) => {
        tado.login(login, pass)
            .then(result => {
                console.log('TADO authorization successful');
                resolve(true);
            })
            .catch(result => {
                console.log('TADO authorization failed! ', result);
                reject(false);
            });
    });
}

function dbCreatePolicy() {
    return new Promise((resolve,reject) => {

        influx.createRetentionPolicy('Forever',
            {
                database: DB_NAME,
                duration: Influx.INF,
                isDefault: true,
                replication: 1
            })
            .then(resolve(true))
            .catch(reject(false));
    });
};

function initDB() {
    return new Promise((resolve, reject) => {
        influx.createDatabase(DB_NAME)
            .then(result => {
                dbCreatePolicy();
                console.log('Connected to database:', 'http://' + DB_HOST + '/' + DB_NAME);
                resolve(true);
            }, result => {
                reject(result);
            })
    });
}


function tadoSetup() {
    return new Promise((resolve, reject) => {

        authorize(auth.login, auth.password)
            .then(result => {
                tado.me()
                    .then(result => { 
                        homeId = result.homes[0].id;
                        
                        Promise.all([tado.home(homeId), tado.zones(homeId)])
                            .then(results => {
                                home = results[0];
                                zones = results[1];
                                resolve(true);
                            });
                    })
                    .catch(err => {console.log(err)})
            }, result => {
                reject(false);
            });
    });
}

function tadoLogger() {

    for (var zone of zones) {
        tado.state(homeId, zone.id)
            .then((result) => {
                influx.writeMeasurement('thermostat', [
                    {
                        tags: {zone: zone.name},
                        fields: {
                            temperature: result.sensorDataPoints.insideTemperature.celsius,
                            humidity: result.sensorDataPoints.humidity.percentage,
                        },
                    }
                ],
                    {
                        database: DB_NAME,
                        retentionPolicy: 'Forever',
                        precision: 's'
                    }
                ).then(result => {
                    console.log('[%s] Data written to db', moment().toString());
                })
                .catch(err => {
                        console.log('[%s] Error writing to db: ', moment().toString(), err);
                });
            })
            .catch(err => {
                console.error('[%s] Error reading from the thermostat: ', moment().toString(), err.errors[0].code);
            });
            
        setTimeout(tadoLogger, logInterval);
    }
}

Promise.all([initDB(), tadoSetup()])
    .then(results => {
        console.log('Logging started...');
        tadoLogger();
    }, results => {
        console.log('Initialization failed [%s]. Cannot start logging.', results.code);
    });