var tap = require('tap')
, http = require('http')
, Templar = require("../")
, ejs = require('ejs')
, fs = require('fs')
, path = require('path')
, request = require('request')
, PORT = process.env.PORT || 1337
, tplOpts = { engine: ejs, folder: __dirname, cache: false }

, server = http.createServer(function (req, res) {
  res.template = Templar(req, res, tplOpts)

  // pluck the if-none-match off the headers, since
  // we'll be changing that one up.
  var h = Object.keys(req.headers).filter(function (k) {
    return k !== 'if-none-match'
  }).reduce(function (s, k) {
    s[k] = req.headers[k]
    return s
  }, {})

  console.error('SERVER', req.url)

  switch (req.url) {
    case '/foo':
      return res.template('foo.ejs', { headers: h })

    default:
      res.statusCode = 404
      return res.end()
  }
})

function req (url, cb) {
  if (typeof url === 'string') {
    url = {url: url}
  }
  url.url = 'http://localhost:' + PORT + url.url

  request(url, function (er, res, body) {
    if (er) throw er
    return cb(er, res, body)
  })
}

function templateReplace (templateFileName, str, strToReplace) {
  var filePath = path.join(__dirname, templateFileName)
  var t = fs.readFileSync(filePath, 'utf8')
  t = t.replace(str, strToReplace)
  fs.writeFileSync(filePath, t)
}

tap.test('setup', function (t) {
  server.listen(PORT, function () {
    t.pass('listening')
    t.end()
  })
})

var etag
tap.test('/foo first', function (t) {
  req('/foo', function (er, res, body) {
    etag = res.headers.etag
    t.ok(etag, 'has etag')
    t.equal(res.headers['content-type'], 'text/html')
    t.ok(res.headers.date)
    t.equal(res.headers.connection, 'keep-alive')
    t.equal(res.headers['transfer-encoding'], 'chunked')
    t.equal(body, '<html>\n'
                + '<body>\n'
                + '<h1>This is the land of the FOO</h1>\n'
                + '<pre>{"host":"localhost:' + PORT + '","connection":"keep-alive"}</pre>\n'
                + '</body>\n'
                + '</html>\n')
    t.end()
  })
})

tap.test('/foo cached', function (t) {
  templateReplace('foo.ejs', 'This is the land of the FOO', 'This is the land of the cached FOO')

  req({ headers: { 'if-none-match': etag }
      , url: '/foo' }, function (er, res, body) {
    t.ok(etag, 'has etag')
    t.equal(res.headers['content-type'], 'text/html')
    t.ok(res.headers.date)
    t.equal(res.headers.connection, 'keep-alive')
    t.equal(res.headers['transfer-encoding'], 'chunked')
    t.equal(body, '<html>\n'
                + '<body>\n'
                + '<h1>This is the land of the cached FOO</h1>\n'
                + '<pre>{"host":"localhost:' + PORT + '","connection":"keep-alive"}</pre>\n'
                + '</body>\n'
                + '</html>\n')

    templateReplace('foo.ejs', 'This is the land of the cached FOO', 'This is the land of the FOO')

    t.end()
  })
})

// assert that we *don't* get the same response when
// we change up the effective results
tap.test('/foo nocached', function (t) {
  templateReplace('foo.ejs', 'This is the land of the FOO', 'This is the land of the un-cached FOO')

  req({ headers: { 'if-none-match': etag, 'x-foo': 'bar' }
      , url: '/foo' }, function (er, res, body) {
    t.equal(res.statusCode, 200)
    t.ok(res.headers.etag, 'has etag')
    t.equal(res.headers['content-type'], 'text/html')
    t.ok(res.headers.date)
    t.equal(res.headers.connection, 'keep-alive')
    t.equal(res.headers['transfer-encoding'], 'chunked')
    t.equal(body, '<html>\n'
                + '<body>\n'
                + '<h1>This is the land of the un-cached FOO</h1>\n'
                + '<pre>{"x-foo":"bar","host":"localhost:' + PORT + '","connection":"keep-alive"}</pre>\n'
                + '</body>\n'
                + '</html>\n')

    templateReplace('foo.ejs', 'This is the land of the un-cached FOO', 'This is the land of the FOO')
    t.end()
  })
})

tap.test('shutdown', function (t) {
  server.close(function () {
    t.pass('server closed')
    t.end()
  })
})
