# Tedis

Fork of Tedis' project (https://github.com/silkjs/tedis.git).
Created and maintained by Daniel Froz <daniel.froz at actt.io>

## Motivation

Doing this fork since found this project interesting and wanted to fix a issue of my production environment.
Currently using ioredis where memory leaks is causing me problems, decided to investigate further and
found better to change my code to Tedis.

However, Tedis has serious parser problems. Besides needed support to Redis Streams.
Long story short... this clone intend to be utilized in the production with Streams.

Added redis-parser / redis-errors, code into this project as well. but optimized for production based on my own experience
and usage.

## Base Project

Main idea here is consolidate best code execution for production.
Tried to keep the interfaces as much as compatibile as possible with the original.
No guarantees

## Documentation

Looking for documentation? Refers to Tedis project.