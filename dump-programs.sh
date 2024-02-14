#!/bin/bash

solana program dump -u https://api.mainnet-beta.solana.com BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY anchor/target/deploy/bubblegum.so
solana program dump -u https://api.mainnet-beta.solana.com cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK anchor/target/deploy/spl_account_compression.so
solana program dump -u https://api.mainnet-beta.solana.com noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV anchor/target/deploy/spl_noop.so
