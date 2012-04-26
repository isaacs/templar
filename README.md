# templar

A minimal template thing for node.js web sites to use.

Works with any template engine that works with Express.

Automatically sends ETags based on the data and the template being used,
and 304 responses based on the `If-None-Match` request header, if the
user would be getting the same exact response as last time.

## Example

```javascript
var ejs = require('ejs')
, Templar = require('templar')
, templarOptions = { engine: ejs, folder: './templates' }

// preload it.  Otherwise, the first request is slow, because
// it has to load up all the templates within it.
Templar.loadFolder('./templates')

http.createServer(function (req, res) {
  // note that this causes a sync fs hit the first time if
  // the folder has not been loaded yet.
  res.template = Templar(req, res, templarOptions)

  // .. later, after figuring out which template to use ..
  res.template('foo.ejs', { some: 'data', for: [ 'the', 'template'] })
}).listen(PORT)
```

## Options

* `engine`: The engine to use.  EJS and Jade both work.
* `folder`: The folder where template files are found.
* `debug`: Pass `debug` as an option to the engine.compile()
