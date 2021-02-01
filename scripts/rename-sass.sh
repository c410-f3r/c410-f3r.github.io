#!/usr/bin/env bash

for d in ../sass/bulma/sass/*/ ; do
    pushd $d
    find * | grep "^[^_]*$" | xargs -n1 sh -c 'mv $0 _$0'
    popd
done
