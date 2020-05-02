# Tedis

Fork of Tedis' project (https://github.com/silkjs/tedis.git)

## Motivation

Currently using ioredis where memory leaks is causing me problems; needed a solution which was easy to use and reliable. Looking at nodejs clients, found this Tedis project... Typescript is a huge plus. So Tedis was a natural choice. However, testing Tedis found out that it has serious code issues ... parser and interfaces... Anyways... decided to change the code and keep this open for others to contribute.

Optimized for production based on my own experience and usage.

Main goal is to make it production ready and ready for Redis Streams. XREADGROUP and other commands support is already done. Check tedis_command_xstreams.spec.ts.

## Documentation

Looking for documentation? Refers to Tedis project

## Contribution

Preferrably ideas from this project can be incorporated to the main Tedis project.
So let's see...