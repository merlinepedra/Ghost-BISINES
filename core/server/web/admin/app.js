const debug = require('@tryghost/debug')('web:admin:app');
const express = require('../../../shared/express');
const config = require('../../../shared/config');
const urlUtils = require('../../../shared/url-utils');
const shared = require('../shared');
const errorHandler = require('@tryghost/mw-error-handler');
const sentry = require('../../../shared/sentry');
const redirectAdminUrls = require('./middleware/redirect-admin-urls');
const {createProxyMiddleware} = require('http-proxy-middleware');

module.exports = function setupAdminApp() {
    debug('Admin setup start');
    const adminApp = express('admin');

    const unpkgProxy = createProxyMiddleware({
        target: 'https://unpkg.com/@tryghost/admin',
        followRedirects: true,
        changeOrigin: true,
        pathRewrite: (path) => {
            return path
                .replace('/ghost/', '')
                .replace(/^assets/, 'dist/assets');
        }
    });

    // Admin assets
    // TODO: not ideal, need to rewrite assets in Admin build to use absolute unpkg URLs
    adminApp.use('/assets', unpkgProxy);

    // Ember CLI's live-reload script
    if (config.get('env') === 'development') {
        adminApp.get('/ember-cli-live-reload.js', function emberLiveReload(req, res) {
            res.redirect(`http://localhost:4200${urlUtils.getSubdir()}/ghost/ember-cli-live-reload.js`);
        });
    }

    // Force SSL if required
    // must happen AFTER asset loading and BEFORE routing
    adminApp.use(shared.middleware.urlRedirects.adminSSLAndHostRedirect);

    // Add in all trailing slashes & remove uppercase
    // must happen AFTER asset loading and BEFORE routing
    adminApp.use(shared.middleware.prettyUrls);

    // Cache headers go last before serving the request
    // Admin is currently set to not be cached at all
    adminApp.use(shared.middleware.cacheControl('private'));

    // Special redirects for the admin (these should have their own cache-control headers)
    adminApp.use(redirectAdminUrls);

    // Finally, routing
    adminApp.use('/', unpkgProxy);

    adminApp.use((err, req, res, next) => {
        if (err.statusCode && err.statusCode === 404) {
            // Remove 404 errors for next middleware to inject
            next();
        } else {
            next(err);
        }
    });
    adminApp.use(errorHandler.pageNotFound);
    adminApp.use(errorHandler.handleHTMLResponse(sentry));

    debug('Admin setup end');

    return adminApp;
};
