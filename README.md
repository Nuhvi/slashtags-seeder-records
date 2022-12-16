# slashtags-DHT

Map slashtags to a their seeders', relays and other crucial services!

## Install

```bash
npm install -g slashtags-router
```

## Usage

### Run a routing node

```bash
slashrouter run
```

### Store a recorde

```bash
slashrouter put <seed utf8> url1 url2 url3
```

### Ger a record for a publicKey

```bash
slashrouter get <publicKey hex>
```

### Example
example:

```bash
$ slashrouter put foo example.com
Saved a record for  f61c8489c2c7e7f4c402183c6921840bf592a1db5958edc4f2ea83b0d4e6f0f6

$ slashrouter put foo example.com
Resolved record for f61c8489c2c7e7f4c402183c6921840bf592a1db5958edc4f2ea83b0d4e6f0f6
 [ 'example.com' ]
```
