var child_process = require('child_process');
var fs = require('fs-extra');
var extend = require('extend');
var glob = require('glob');
var ini = require('ini');
var NodeGit = require('nodegit');
var path = require('path');
var Q = require('q');

module.exports = function(logger) {
    return {
        steamcmdUpdate: function(name, steamcmd, appid, username, password) {
            var deferred = Q.defer();

            var update = child_process.spawn('./steamcmd.sh', [
                '+login', username, password,
                '+app_update', appid, 'validate',
                '+quit'
            ], {
                cwd: steamcmd
            });

            update.stderr.pipe(process.stderr);

            update.on('exit', function(code, signal) {
                if (signal) {
                    deferred.reject(new Error('SteamCMD was killed with signal: ' + signal));
                }
                else if (code) {
                    deferred.reject(new Error('SteamCMD exited with code: ' + code));
                }
                else {
                    deferred.resolve();
                }
            });

            return deferred.promise;
        },
        checkoutRepo: function(name, repoPath, url, checkout) {
            return NodeGit.Repository.open(repoPath)
                .catch(function() {
                    return Q.nfcall(fs.mkdirs, repoPath)
                        .then(function() {
                            return Q.nfcall(fs.emptyDir, repoPath);
                        })
                        .then(function() {
                            return NodeGit.Clone(url, repoPath);
                        });
                })
                .then(function(repo) {
                    if (checkout) {
                        return repo.getStatusExt()
                            .then(function(statuses) {
                                if (statuses.length !== 0) {
                                    throw new Error('Uncommitted changes prevent checking out new version.');
                                }
                            })
                            .then(function() {
                                return repo.fetchAll({});
                            })
                            .then(function() {
                                return NodeGit.Reference.dwim(repo, checkout)
                                    .catch(function() {
                                        return repo.getRemotes().then(function(remotes) {
                                            var getBranch = [];

                                            remotes.forEach(function(remote) {
                                                getBranch.push(NodeGit.Branch.lookup(repo, remote + '/' + checkout, NodeGit.Branch.BRANCH.REMOTE).then(function(ref) {
                                                    return {remote: remote, ref: ref};
                                                }, function() {
                                                    return null;
                                                }));
                                            });

                                            return Promise.all(getBranch)
                                                .then(function(remoteBranches) {
                                                    var foundBranch = null;

                                                    remoteBranches.forEach(function(remoteBranch) {
                                                        if (remoteBranch && foundBranch) {
                                                            throw new Error('Multiple remotes had the branch.');
                                                        }

                                                        foundBranch = remoteBranch;
                                                    });

                                                    if (!foundBranch) {
                                                        throw new Error('No remote had the branch.');
                                                    }

                                                    return foundBranch;
                                                })
                                                .then(function(remoteBranch) {
                                                    return repo.getCommit(remoteBranch.ref.target())
                                                        .then(function(commit) {
                                                            return NodeGit.Branch.create(repo, checkout, commit, 0, repo.defaultSignature(), null);
                                                        })
                                                        .then(function(ref) {
                                                            // getting the name of a branch causes crashes, so let's avoid that
                                                            var match = /refs\/remotes\/(.+)/.exec(remoteBranch.ref.name());

                                                            if (match && match[1]) {
                                                                NodeGit.Branch.setUpstream(ref, match[1]);
                                                            }

                                                            return ref;
                                                        });
                                                });
                                        });
                                    })
                                    .then(function(ref) {
                                        return ref.resolve()
                                            .then(function(ref) {
                                                if (ref.isTag()) {
                                                    return repo.getTag(ref.target())
                                                        .then(function(tag) {
                                                            return repo.getCommit(tag.targetId())
                                                                .then(function(commit) {
                                                                    return commit.getTree();
                                                                })
                                                                .then(function(tree) {
                                                                    return NodeGit.Checkout.tree(repo, tree, {checkoutStrategy: NodeGit.Checkout.STRATEGY.SAFE_CREATE});
                                                                })
                                                                .then(function() {
                                                                    return repo.setHeadDetached(tag.targetId(), repo.defaultSignature(), 'Switched to ' + checkout);
                                                                });
                                                        });
                                                }
                                                else {
                                                    return Q.fcall(function() {
                                                        // getting the name of a branch causes crashes, so let's avoid that
                                                        var localMatch = /refs\/heads\/(.+)/.exec(ref.name());
                                                        var upstreamMatch = /refs\/remotes\/(.+)/.exec(NodeGit.Branch.upstream(ref).name());

                                                        if (localMatch && localMatch[1] && upstreamMatch && upstreamMatch[1]) {
                                                            return repo.mergeBranches(localMatch[1], upstreamMatch[1]);
                                                        }
                                                    })
                                                        .done(function() {
                                                            var match = /refs\/heads\/(.+)/.exec(ref.name());

                                                            if (match && match[1]) {
                                                                return NodeGit.Reference.dwim(repo, match[1])
                                                                    .then(function(ref) {
                                                                        return repo.getCommit(ref.target())
                                                                            .then(function(commit) {
                                                                                return commit.getTree();
                                                                            })
                                                                            .then(function(tree) {
                                                                                return NodeGit.Checkout.tree(repo, tree, {checkoutStrategy: NodeGit.Checkout.STRATEGY.FORCE});
                                                                            })
                                                                            .then(function() {
                                                                                return repo.setHead(ref.name(), repo.defaultSignature(), 'Switched to ' + checkout);
                                                                            });
                                                                    });
                                                            }
                                                        });
                                                }
                                            });
                                    }, function() {
                                        return NodeGit.Commit.lookupPrefix(repo, NodeGit.Oid.fromString((checkout + '0000000000000000000000000000000000000000').slice(0, 40)), checkout.length)
                                            .then(function(commit) {
                                                return NodeGit.Checkout.tree(repo, commit, {checkoutStrategy: NodeGit.Checkout.STRATEGY.SAFE_CREATE}).then(function() {
                                                    return repo.setHeadDetached(commit.id(), repo.defaultSignature(), 'Switched to ' + checkout);
                                                });
                                            }, function() {
                                                throw new Error('Could not identify commit to checkout!');
                                            });
                                    });
                            })
                            .then(function() {
                                return repo;
                            });
                    }
                })
                .then(function(repo) {
                    return Q.fcall(function() {
                        return NodeGit.Submodule.reloadAll(repo, 1);
                    })
                        .then(function() {
                            // for some reason updating submodules doesn't work either...

                            // return Q.nfcall(fs.readFile, path.join(repoPath, '.gitmodules'), 'utf-8')
                            //     .then(function(data) {
                            //         var submoduleConfig = ini.parse(data);
                            //
                            //         return Promise.all(Object.keys(submoduleConfig).map(function(sectionName) {
                            //             var match = /submodule \"(.+)\"/.exec(sectionName);
                            //
                            //             if (match && match[1]) {
                            //                 return NodeGit.Submodule.lookup(repo, match[1]).then(function(submodule) {
                            //                     return submodule.update(1, null);
                            //                 });
                            //             }
                            //         }));
                            //     }, function() {
                            //         return;
                            //     });

                            var deferred = Q.defer();

                            // for some reason this has an issue if not delayed
                            setTimeout(function() {
                                var submoduleUpdate = child_process.spawn('git', [
                                    'submodule', 'update',
                                    '--init', '--recursive'
                                ], {
                                    cwd: repoPath
                                });

                                submoduleUpdate.stderr.pipe(process.stderr);

                                submoduleUpdate.on('exit', function(code, signal) {
                                    if (signal) {
                                        deferred.reject(new Error('Git submodule update was killed with signal: ' + signal));
                                    }
                                    else if (code) {
                                        deferred.reject(new Error('Git submodule update exited with code: ' + code));
                                    }
                                    else {
                                        deferred.resolve();
                                    }
                                });
                            }, 5000);

                            return deferred.promise;
                        });
                });
        },
        ambuild: function(name, repo, extraArgs, extraEnv) {
            var env = {};
            extend(env, process.env, extraEnv);

            return Q.nfcall(fs.mkdirs, path.join(repo, 'build'))
                .then(function() {
                    var deferred = Q.defer();

                    var configure = child_process.spawn('python', [
                        path.join(repo, 'configure.py')
                    ].concat(extraArgs), {
                        cwd: path.join(repo, 'build'),
                        env: env
                    });

                    configure.stderr.pipe(process.stderr);

                    configure.on('exit', function(code, signal) {
                        if (signal) {
                            deferred.reject(new Error('Configure was killed with signal: ' + signal));
                        }
                        else if (code) {
                            deferred.reject(new Error('Configure exited with code: ' + code));
                        }
                        else {
                            deferred.resolve();
                        }
                    });

                    return deferred.promise;
                })
                .then(function() {
                    var deferred = Q.defer();

                    var build = child_process.spawn('ambuild', {
                        cwd: path.join(repo, 'build')
                    });

                    build.stderr.pipe(process.stderr);

                    build.on('exit', function(code, signal) {
                        if (signal) {
                            deferred.reject(new Error('Build was killed with signal: ' + signal));
                        }
                        else if (code) {
                            deferred.reject(new Error('Build exited with code: ' + code));
                        }
                        else {
                            deferred.resolve();
                        }
                    });

                    return deferred.promise;
                });
        },
        mirrorLink: function(name, src, dest, force) {
            return Q.nfcall(fs.mkdirs, dest)
                .then(function() {
                    return Q.nfcall(glob, path.join(src, '*'));
                })
                .then(function(matches) {
                    if (matches && matches.length >= 0) {
                        var deferred = Q.defer();

                        var copy = child_process.spawn('cp', matches.concat([
                            dest,
                            '-r',
                            '-s'
                        ], force ? ['--remove-destination'] : ['-n']));

                        copy.stderr.pipe(process.stderr);

                        copy.on('exit', function(code, signal) {
                            if (signal) {
                                deferred.reject(new Error('Link was killed with signal: ' + signal));
                            }
                            else if (code) {
                                deferred.reject(new Error('Link exited with code: ' + code));
                            }
                            else {
                                deferred.resolve();
                            }
                        });

                        return deferred.promise;
                    }
                });
        },
        mirror: function(name, src, dest, recursive, existingOnly) {
            return Q.nfcall(fs.mkdirs, dest)
                .then(function() {
                    var deferred = Q.defer();

                    var sync = child_process.spawn('rsync', [
                        src,
                        dest
                    ].concat(recursive ? ['-r'] : [], existingOnly ? ['--existing'] : []));

                    sync.stderr.pipe(process.stderr);

                    sync.on('exit', function(code, signal) {
                        if (signal) {
                            deferred.reject(new Error('Sync was killed with signal: ' + signal));
                        }
                        else if (code) {
                            deferred.reject(new Error('Sync exited with code: ' + code));
                        }
                        else {
                            deferred.resolve();
                        }
                    });

                    return deferred.promise;
                });
        }
    };
};
