/* jshint esnext: true */
/* jshint node: true */

'use strict';

var request = require('request');
var moment = require('moment');

const BASE_URL = 'https://my.tado.com';
const CLIENT_ID = 'tado-webapp';
const REFERER = 'https://my.tado.com/';

module.exports = class ApiClient {
    login(username, password) {
        return new Promise((resolve, reject) => {
            request.post({
                url: BASE_URL + '/oauth/token',
                qs: {
                    client_id: CLIENT_ID,
                    grant_type: 'password',
                    password: password,
                    username: username,
                    scope: 'home.user'
                },
                json: true
            }, (err, response, result) => {
                if (err || response.statusCode !== 200) {
                    reject(err || result);
                } else {
                    this.saveToken(result);
                    resolve(true);
                }
            });
        });
    }

    saveToken(token) {
//        console.log(token);
        this.token = token;
        this.token.expires_in = moment().add(token.expires_in, 'seconds').toDate();
        console.log('[%s] NEW TOKEN [Expires in: %s]', moment().toString(), this.token.expires_in.toString());
    }

    refreshToken() {
        return new Promise((resolve, reject) => {
            if (!this.token) {
                return reject(new Error('not logged in'));
            }

            if (moment().subtract(5, 'seconds').isBefore(this.token.expires_in)) {
                return resolve();
            }

            request.get({
                url: BASE_URL + '/oauth/token',
                qs: {
                    client_id: CLIENT_ID,
                    grant_type: 'refresh_token',
                    refresh_token: this.token.refresh_token
                },
                json: true
            }, (err, response, result) => {
                if (err || response.statusCode !== 200) {
                    console.log('Error refreshing token: ', err, response.statusCode);
                    reject(err || result);
                } else {
                    this.saveToken(result);
                    resolve(true);
                }
            });
        });
    }

    api(path, passback) {
        //console.log('b');
        return this.refreshToken()
            .then(() => {
          //      console.log('c');
                return new Promise((resolve, reject) => {
                    request.get({
                        url: BASE_URL + '/api/v2' + path,
                        json: true,
                        headers: {
                            referer: REFERER
                        },
                        auth: {
                            bearer: this.token.access_token
                        }
                    }, (err, response, result) => {
                        if (err || response.statusCode !== 200) {
                            reject(err || result);
                        } else {
                            resolve(passback === undefined ? result : {result: result, passback: passback});
                        }
                    });
                });
            }).catch(err => {
                console.error('ERR' + err);
            });
            //console.log('d');
    }

    me() {
        return this.api('/me');
    }

    home(homeId) {
        return this.api(`/homes/${homeId}`);
    }

    zones(homeId) {
        return this.api(`/homes/${homeId}/zones`);
    }

    weather(homeId) {
        return this.api(`/homes/${homeId}/weather`);
    }

    state(homeId, zoneId) {
        //console.log('a');
        return this.api(`/homes/${homeId}/zones/${zoneId}/state`, { homeId: homeId, zoneId: zoneId });
    }
}