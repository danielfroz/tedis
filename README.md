# Tedis

Fork of Tedis' project (https://github.com/silkjs/tedis.git).
Created and maintained by Daniel Froz <daniel.froz at actt.io>

## Motivation

Doing this fork since found this project interesting and wanted to fix an issue with my production environment.
Currently using ioredis where memory leaks is causing me problems. Anyways, found this Tedis project
and here it goes... Tedis has serious problems with the Parser and internally. Changed recently by other
contributor... but found better to keep my own version.

Added redis-parser / redis-errors. Optimized for production based on my own experience and usage.
Besides you may utilize it with Redis Streams. XREADGROUP and other commands supported with tedis.command()
method.

## Base Project

Main idea here is consolidate best code execution for production.
Tried to keep the interfaces as much as compatibile as possible with the original.
No guarantees

## Documentation

Looking for documentation? Refers to Tedis project.