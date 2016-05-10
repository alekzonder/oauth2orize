/**
 * Module dependencies.
 */
var utils = require('../utils')
  , AuthorizationError = require('../errors/authorizationerror')
  , BadRequestError = require('../errors/badrequesterror')
  , ForbiddenError = require('../errors/forbiddenerror');


function SessionStore() {
  this._key = 'authorize';
  this._field = 'transaction_id';
  this._idLength = 8;
}

SessionStore.prototype.setOptions = function(options) {
  options = options || {};
  
  this._key = options.sessionKey || 'authorize';
  this._field = options.transactionField || 'transaction_id';
  this._idLength = options.idLength || 8;
}

SessionStore.prototype.load = function(server, req, cb) {
  var field = this._field
    , key = this._key;
  
  if (!req.session) { return cb(new Error('OAuth2orize requires session support. Did you forget app.use(express.session(...))?')); }
  if (!req.session[key]) { return cb(new ForbiddenError('Unable to load OAuth 2.0 transactions from session')); }
  
  var query = req.query || {}
    , body = req.body || {}
    , tid = query[field] || body[field];

  if (!tid) { return cb(new BadRequestError('Missing required parameter: ' + field)); }
  var txn = req.session[key][tid];
  if (!txn) { return cb(new ForbiddenError('Unable to load OAuth 2.0 transaction: ' + tid)); }
  
  var self = this;
  server.deserializeClient(txn.client, function(err, client) {
    if (err) { return cb(err); }
    if (!client) {
      // At the time the request was initiated, the client was validated.
      // Since then, however, it has been invalidated.  The transaction will
      // be invalidated and no response will be sent to the client.
      self.remove(req, tid, function(err) {
        if (err) { return cb(err); }
        return cb(new AuthorizationError('Unauthorized client', 'unauthorized_client'));
      });
      return;
    }
  
    txn.transactionID = tid;
    txn.client = client;
    cb(null, txn);
  });
}

SessionStore.prototype.store = function(req, txn, cb) {
  var lenTxnID = this._idLength
    , key = this._key;
    
  var tid = utils.uid(lenTxnID);
  
  // store transaction in session
  var txns = req.session[key] = req.session[key] || {};
  txns[tid] = txn;
  
  cb(null, tid);
}

SessionStore.prototype.remove = function(req, tid, cb) {
  if (!req.session) { return cb(new Error('OAuth2orize requires session support. Did you forget app.use(express.session(...))?')); }
  
  var key = this._key;
  
  if (req.session[key]) {
    delete req.session[key][tid];
  }

  if (req.oauth2) {
    delete req.oauth2.transactionID;
    if (Object.keys(req.oauth2).length == 0) {
      delete req.oauth2;
    }
  }
  
  cb();
}


module.exports = SessionStore;