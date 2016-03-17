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
            logger.log('verbose', '[' + name + '] Starting SteamCMD...');

            var deferred = Q.defer();

            var update = child_process.spawn('./steamcmd.sh', [
                '+login', username, password,
                '+app_update', appid, 'validate',
                '+quit'
            ], {
                cwd: steamcmd
            });

            update.stdout.on('data', function(out) {
                logger.log('debug', '[' + name + ' - SteamCMD] ' + out);
            });
            update.stderr.on('data', function(out) {
                logger.log('warn', '[' + name + ' - SteamCMD] ' + out);
            });

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
                    logger.log('verbose', '[' + name + '] Cloning repository...');
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

                                logger.log('verbose', '[' + name + '] Fetching all remotes...');

                                return repo.fetchAll({})
                                    .then(function() {
                                        logger.log('verbose', '[' + name + '] Looking up reference name...');

                                        return NodeGit.Reference.dwim(repo, checkout)
                                            .catch(function() {
                                                logger.log('verbose', '[' + name + '] Local reference not found. Looking up remote branches...');

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
                                                            logger.log('verbose', '[' + name + '] Found remote branch ' + remoteBranch.remote + '/' + refName + '.');

                                                            logger.log('verbose', '[' + name + '] Checking out remote branch locally...');

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
                                                            logger.log('verbose', '[' + name + '] Checking out tag...');

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
                                                                            return repo.setHeadDetached(tag.targetId());
                                                                        });
                                                                });
                                                        }
                                                        else {
                                                            return Q.fcall(function() {
                                                                // getting the name of a branch causes crashes, so let's avoid that
                                                                var localMatch = /refs\/heads\/(.+)/.exec(ref.name());

                                                                return NodeGit.Branch.upstream(ref).then(function(upstreamRef) {
                                                                    var upstreamMatch = /refs\/remotes\/(.+)/.exec(upstreamRef.name());

                                                                    if (localMatch && localMatch[1] && upstreamMatch && upstreamMatch[1]) {
                                                                        logger.log('verbose', '[' + name + '] Merging upstream branch ' + upstreamMatch[1] + ' into local branch ' + localMatch[1] + '...');

                                                                        return repo.mergeBranches(localMatch[1], upstreamMatch[1]);
                                                                    }
                                                                });
                                                            })
                                                                .done(function() {
                                                                    logger.log('verbose', '[' + name + '] Checking out branch...');

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
                                                                                        return repo.setHead(ref.name());
                                                                                    });
                                                                            });
                                                                    }
                                                                });
                                                        }
                                                    });
                                            }, function() {
                                                logger.log('verbose', '[' + name + '] No valid reference found. Searching commits...');

                                                return NodeGit.Commit.lookupPrefix(repo, NodeGit.Oid.fromString((checkout + '0000000000000000000000000000000000000000').slice(0, 40)), checkout.length)
                                                    .then(function(commit) {
                                                        logger.log('verbose', '[' + name + '] Found valid commit ' + commit.id() + '.');
                                                        logger.log('verbose', '[' + name + '] Checking out tag...');

                                                        return NodeGit.Checkout.tree(repo, commit, {checkoutStrategy: NodeGit.Checkout.STRATEGY.SAFE_CREATE}).then(function() {
                                                            return repo.setHeadDetached(commit.id());
                                                        });
                                                    }, function() {
                                                        throw new Error('Could not identify commit to checkout!');
                                                    });
                                            });
                                    })
                                    .then(function() {
                                        return repo;
                                    });
                            });
                    }
                })
                .then(function(repo) {
                    return Q.fcall(function() {
                        // for some reason updating submodules doesn't work either...

                        var deferred = Q.defer();

                        // for some reason this has an issue if not delayed
                        setTimeout(function() {
                            logger.log('verbose', '[' + name + '] Updating submodules...');

                            var submoduleUpdate = child_process.spawn('git', [
                                'submodule', 'update',
                                '--init', '--recursive'
                            ], {
                                cwd: repoPath
                            });

                            submoduleUpdate.stdout.on('data', function(out) {
                                logger.log('debug', '[' + name + ' - Git submodule update] ' + out);
                            });
                            submoduleUpdate.stderr.on('data', function(out) {
                                logger.log('warn', '[' + name + ' - Git submodule update] ' + out);
                            });

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
                        }, 1000);

                        return deferred.promise;
                    });
                });
        },
        ambuild: function(name, repo, extraArgs, extraEnv) {
            var env = {};
            extend(env, process.env, extraEnv);

            return Q.nfcall(fs.mkdirs, path.join(repo, 'build'))
                .then(function() {
                    logger.log('verbose', '[' + name + '] Auto-configuring build...');

                    var deferred = Q.defer();

                    var configure = child_process.spawn('python', [
                        path.join(repo, 'configure.py')
                    ].concat(extraArgs), {
                        cwd: path.join(repo, 'build'),
                        env: env
                    });

                    configure.stdout.on('data', function(out) {
                        logger.log('debug', '[' + name + ' - Configure] ' + out);
                    });
                    configure.stderr.on('data', function(out) {
                        logger.log('warn', '[' + name + ' - Configure] ' + out);
                    });

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
                    logger.log('verbose', '[' + name + '] Building...');

                    var deferred = Q.defer();

                    var build = child_process.spawn('ambuild', {
                        cwd: path.join(repo, 'build')
                    });

                    build.stdout.on('data', function(out) {
                        logger.log('debug', '[' + name + ' - Build] ' + out);
                    });
                    build.stderr.on('data', function(out) {
                        logger.log('warn', '[' + name + ' - Build] ' + out);
                    });

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
                    logger.log('verbose', '[' + name + '] Calculating glob for source...');

                    return Q.nfcall(glob, path.join(src, '*'));
                })
                .then(function(matches) {
                    if (matches && matches.length >= 0) {
                        logger.log('verbose', '[' + name + '] Linking files...');

                        var deferred = Q.defer();

                        var copy = child_process.spawn('cp', matches.concat([
                            dest,
                            '-r',
                            '-s'
                        ], force ? ['--remove-destination'] : ['-n']));

                        copy.stdout.on('data', function(out) {
                            logger.log('debug', '[' + name + ' - Copy] ' + out);
                        });
                        copy.stderr.on('data', function(out) {
                            logger.log('warn', '[' + name + ' - Copy] ' + out);
                        });

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
                    logger.log('verbose', '[' + name + '] Calculating glob for source...');

                    return Q.nfcall(glob, path.join(src, '*'));
                })
                .then(function(matches) {
                    logger.log('verbose', '[' + name + '] Syncing files...');

                    var deferred = Q.defer();

                    var sync = child_process.spawn('rsync', matches.concat([
                        dest
                    ], recursive ? ['-r'] : [], existingOnly ? ['--existing'] : []));

                    sync.stdout.on('data', function(out) {
                        logger.log('debug', '[' + name + ' - Sync] ' + out);
                    });
                    sync.stderr.on('data', function(out) {
                        logger.log('warn', '[' + name + ' - Sync] ' + out);
                    });

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
