/*
 * version.js — which build is this.
 *
 * Written so a screenshot answers the question "are you running the update?"
 * without anyone having to guess. package.sh rewrites BUILD when it makes a
 * zip, so the string in a delivered copy is the date that copy was built.
 */
export const BUILD = 'dev';
