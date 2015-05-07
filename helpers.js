var child_process = require('child_process');
var fs = require('fs-extra');
var extend = require('extend');
var ini = require('ini');
var NodeGit = require('nodegit');
var path = require('path');
var Q = require('q');

exports.steamcmdUpdate = function(name, steamcmd, appid, username, password) {
    return Q.fcall(function() {
        var deferred = Q.defer();

        var update = child_process.spawn('./steamcmd.sh', [
            '+login', username, password,
            '+app_update', appid, 'validate',
            '+quit'
        ], {
            cwd: steamcmd
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
    })
    .catch(function(err) {
        if (err) {
            throw new Error('When updating ' + name + ': ' + err);
        }
    });
};

exports.checkoutRepo = function(name, repoPath, url, refName) {
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
            if (refName) {
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
                        return NodeGit.Reference.dwim(repo, refName)
                            .then(function(ref) {
                                return repo.setHead(ref.name(), repo.defaultSignature(), 'Switched to ' + refName);
                            }, function() {
                                return repo.getRemotes().then(function(remotes) {
                                    var getBranch = [];

                                    remotes.forEach(function(remote) {
                                        getBranch.push(NodeGit.Reference.dwim(repo, remote + '/' + refName).catch(function() {
                                            return null;
                                        }));
                                    });

                                    return Promise.all(getBranch).then(function(refs) {
                                        var branch = null;

                                        refs.forEach(function(ref) {
                                            if (ref && branch) {
                                                throw new Error('Multiple remotes had the branch.');
                                            }

                                            branch = ref;
                                        });

                                        if (!branch) {
                                            throw new Error('No remote had the branch.');
                                        }

                                        return branch;
                                    });
                                })
                                    .then(function(ref) {
                                        return repo.setHead(ref.name(), repo.defaultSignature(), 'Switched to ' + refName);
                                    }, function() {
                                        return NodeGit.Commit.lookup(repo, refName)
                                            .then(function(commit) {
                                                return repo.setHeadDetached(commit.id(), repo.defaultSignature(), 'Switched to ' + refName);
                                            });
                                    });
                            });
                    })
                    .then(function() {
                        return NodeGit.Checkout.head(repo, {checkoutStrategy: NodeGit.Checkout.STRATEGY.FORCE});
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
                    return Q.nfcall(fs.readFile, path.join(repoPath, '.gitmodules'), 'utf-8')
                        .then(function(data) {
                            var submoduleConfig = ini.parse(data);

                            return Promise.all(Object.keys(submoduleConfig).map(function(sectionName) {
                                var match = /submodule \"(.+)\"/.exec(sectionName);

                                if (match && match[1]) {
                                    return NodeGit.Submodule.lookup(repo, match[1]).then(function(submodule) {
                                        return submodule.update(1, null);
                                    });
                                }
                            }));
                        }, function() {
                            return;
                        });
                });
        })
        .catch(function(err) {
            if (err) {
                throw new Error('When downloading ' + name + ': ' + err);
            }
        });
};

exports.ambuild = function(name, repo, extraArgs, extraEnv) {
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

            configure.on('exit', function(code, signal) {
                if (signal) {
                    deferred.reject(new Error('Configure script was killed with signal: ' + signal));
                }
                else if (code) {
                    deferred.reject(new Error('Configure script exited with code: ' + code));
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

            build.on('exit', function(code, signal) {
                if (signal) {
                    deferred.reject(new Error('Build process was killed with signal: ' + signal));
                }
                else if (code) {
                    deferred.reject(new Error('Build process exited with code: ' + code));
                }
                else {
                    deferred.resolve();
                }
            });

            return deferred.promise;
        })
        .catch(function(err) {
            if (err) {
                throw new Error('When building ' + name + ': ' + err);
            }
        });
};
