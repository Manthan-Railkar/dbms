'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Trophy,
  MapPin,
  Calendar,
  Clock,
  ArrowRight,
  RotateCcw,
  Sparkles,
  Shield,
  Activity,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  Database
} from 'lucide-react';
import { TechTitansLogo, CodeStrikersLogo } from './CricketIcons';

export interface MatchSummaryItem {
  match_id: string | number;
  tournament_name: string;
  team1_name: string;
  team1_city?: string;
  team2_name: string;
  team2_city?: string;
  venue_name: string;
  venue_city?: string;
  match_date: string;
  status: 'Completed' | 'Live' | 'Upcoming';
  winner_name?: string;
  toss_result?: string;
  innings?: Array<{
    inning_no: number;
    batting_team?: string;
    runs: number;
    wickets: number;
    overs: number | string;
  }>;
}

interface RecentMatchesListProps {
  onSelectMatch?: (matchId: string) => void;
  onStartNewMatch?: () => void;
  onRefreshDb?: () => void;
  isCompact?: boolean;
}

export default function RecentMatchesList({
  onSelectMatch,
  onStartNewMatch,
  onRefreshDb,
  isCompact = false
}: RecentMatchesListProps) {
  const [matches, setMatches] = useState<MatchSummaryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshingDb, setIsRefreshingDb] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<'All' | 'Completed' | 'Live'>('All');
  const [notification, setNotification] = useState<string | null>(null);

  const fetchMatches = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/match/list');
      const data = await res.json();
      if (data.success && Array.isArray(data.matches)) {
        setMatches(data.matches);
      }
    } catch (err) {
      console.warn('Failed to fetch matches from API:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMatches();
  }, []);

  const handleRefreshDatabase = async () => {
    setIsRefreshingDb(true);
    setNotification(null);
    try {
      const res = await fetch('/api/db/refresh', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setNotification('✅ Database successfully refreshed & reseeded with fresh match data!');
        if (onRefreshDb) onRefreshDb();
        await fetchMatches();
      } else {
        setNotification('❌ Failed to refresh database: ' + (data.error || 'Unknown error'));
      }
    } catch (err: any) {
      setNotification('❌ Network error refreshing database: ' + err.message);
    } finally {
      setIsRefreshingDb(false);
      setTimeout(() => setNotification(null), 6000);
    }
  };

  const filteredMatches = matches.filter((m) => {
    if (statusFilter === 'All') return true;
    return m.status === statusFilter;
  });

  const getTeamLogo = (teamName: string) => {
    const lower = (teamName || '').toLowerCase();
    if (lower.includes('tech') || lower.includes('mumbai') || lower.includes('titan') || lower.includes('blue')) {
      return <TechTitansLogo className="w-8 h-8 shrink-0 drop-shadow-sm" />;
    }
    return <CodeStrikersLogo className="w-8 h-8 shrink-0 drop-shadow-sm" />;
  };

  return (
    <div className="w-full select-none">
      {/* Toast Notification */}
      {notification && (
        <div className="mb-4 p-3.5 rounded-xl bg-blue-900/90 text-white text-xs sm:text-sm font-semibold flex items-center justify-between shadow-lg backdrop-blur-md border border-blue-400/30 animate-in fade-in duration-200">
          <span>{notification}</span>
          <button
            onClick={() => setNotification(null)}
            className="text-white/70 hover:text-white ml-2 text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Control Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-blue-600/10 text-blue-600">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
              Last Matches Scored
            </h3>
            <p className="text-xs text-slate-500">
              Live & completed match scorecards stored in MySQL Database
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {/* Status Filter Tabs */}
          <div className="flex items-center bg-slate-200/80 p-0.5 rounded-xl text-xs font-bold text-slate-600">
            {(['All', 'Live', 'Completed'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  statusFilter === filter
                    ? 'bg-white text-blue-700 shadow-2xs font-extrabold'
                    : 'hover:text-slate-900'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

          {/* Refresh Matches List Button */}
          <button
            onClick={fetchMatches}
            disabled={isLoading}
            title="Reload Matches List"
            className="p-2 rounded-xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className={`w-4 h-4 ${isLoading ? 'animate-spin text-blue-600' : ''}`} />
          </button>

          {/* Start New Match Button */}
          {onStartNewMatch ? (
            <button
              type="button"
              onClick={onStartNewMatch}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold shadow-md shadow-blue-950/20 transition cursor-pointer active:scale-95 shrink-0"
            >
              <span>🏏 Start New Match</span>
            </button>
          ) : (
            <Link
              href="/?tab=wizard"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold shadow-md shadow-blue-950/20 transition cursor-pointer active:scale-95 shrink-0"
            >
              <span>🏏 Start New Match</span>
            </Link>
          )}

          {/* Refresh Database Button */}
          <button
            onClick={handleRefreshDatabase}
            disabled={isRefreshingDb}
            title="Reset & Reseed Database (Execute schema.sql & seed.sql)"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold shadow-md shadow-emerald-950/20 transition cursor-pointer active:scale-95 disabled:opacity-50"
          >
            <Database className={`w-3.5 h-3.5 ${isRefreshingDb ? 'animate-spin' : ''}`} />
            <span>{isRefreshingDb ? 'Resetting...' : 'Refresh DB'}</span>
          </button>
        </div>
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="p-5 rounded-2xl bg-white border border-slate-200 animate-pulse space-y-3">
              <div className="h-4 bg-slate-200 rounded w-1/3" />
              <div className="h-8 bg-slate-200 rounded w-2/3" />
              <div className="h-4 bg-slate-200 rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredMatches.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
            <Trophy className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-800">No matches found</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              No matches in the database yet. Set up your match details in the Match Setup Wizard to start live scoring!
            </p>
          </div>
          {onStartNewMatch ? (
            <button
              type="button"
              onClick={onStartNewMatch}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-md shadow-blue-500/20 cursor-pointer"
            >
              <span>🏏 Set Up & Start New Match</span>
            </button>
          ) : (
            <Link
              href="/?tab=wizard"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-md shadow-blue-500/20"
            >
              <span>🏏 Set Up & Start New Match</span>
            </Link>
          )}
        </div>
      )}

      {/* Matches Grid */}
      {!isLoading && filteredMatches.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredMatches.map((m) => {
            const inn1 = m.innings?.find((i) => i.inning_no === 1);
            const inn2 = m.innings?.find((i) => i.inning_no === 2);

            const isLive = m.status === 'Live';
            const isCompleted = m.status === 'Completed';

            return (
              <div
                key={m.match_id}
                className="bg-white rounded-2xl border border-slate-200/90 hover:border-blue-400 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col justify-between"
              >
                {/* Header Strip */}
                <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-extrabold text-blue-700 tracking-wide uppercase">
                      Match {m.match_id}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="font-medium text-slate-600 truncate max-w-[180px] sm:max-w-[220px]">
                      {m.tournament_name}
                    </span>
                  </div>

                  {/* Status Badge */}
                  <div>
                    {isLive && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-red-50 text-red-700 border border-red-200">
                        <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
                        LIVE
                      </span>
                    )}
                    {isCompleted && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        COMPLETED
                      </span>
                    )}
                    {!isLive && !isCompleted && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        UPCOMING
                      </span>
                    )}
                  </div>
                </div>

                {/* Match Content */}
                <div className="p-4 space-y-3.5">
                  {/* Venue & Date */}
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <div className="flex items-center gap-1 truncate">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{m.venue_name}{m.venue_city ? `, ${m.venue_city}` : ''}</span>
                    </div>
                    {m.match_date && (
                      <div className="flex items-center gap-1 shrink-0 text-slate-400">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{new Date(m.match_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      </div>
                    )}
                  </div>

                  {/* Teams & Scores */}
                  <div className="space-y-2.5 py-1">
                    {/* Team 1 */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        {getTeamLogo(m.team1_name)}
                        <div>
                          <p className="text-sm font-extrabold text-slate-900 leading-none">
                            {m.team1_name}
                          </p>
                          {m.team1_city && (
                            <p className="text-[11px] text-slate-400 mt-0.5">{m.team1_city}</p>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        {inn1 ? (
                          <p className="text-sm font-black text-slate-900 tracking-tight">
                            {inn1.runs}/{inn1.wickets}
                            <span className="text-xs font-semibold text-slate-500 ml-1.5">
                              ({inn1.overs} ov)
                            </span>
                          </p>
                        ) : (
                          <span className="text-xs text-slate-400 font-medium">Yet to bat</span>
                        )}
                      </div>
                    </div>

                    {/* Team 2 */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        {getTeamLogo(m.team2_name)}
                        <div>
                          <p className="text-sm font-extrabold text-slate-900 leading-none">
                            {m.team2_name}
                          </p>
                          {m.team2_city && (
                            <p className="text-[11px] text-slate-400 mt-0.5">{m.team2_city}</p>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        {inn2 ? (
                          <p className="text-sm font-black text-slate-900 tracking-tight">
                            {inn2.runs}/{inn2.wickets}
                            <span className="text-xs font-semibold text-slate-500 ml-1.5">
                              ({inn2.overs} ov)
                            </span>
                          </p>
                        ) : isLive && inn1 ? (
                          <span className="text-xs text-blue-600 font-bold">Yet to bat</span>
                        ) : (
                          <span className="text-xs text-slate-400 font-medium">Yet to bat</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Winner / Result Summary */}
                  <div className="pt-2 border-t border-slate-100 text-xs">
                    {m.winner_name ? (
                      <p className="font-bold text-emerald-800 flex items-center gap-1.5">
                        <Trophy className="w-3.5 h-3.5 text-amber-500" />
                        <span>{m.winner_name} won the match</span>
                      </p>
                    ) : isCompleted ? (
                      <p className="font-bold text-slate-700 flex items-center gap-1.5">
                        <Trophy className="w-3.5 h-3.5 text-amber-500" />
                        <span>Match Concluded • Tied</span>
                      </p>
                    ) : isLive ? (
                      <p className="font-bold text-red-600 flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-red-500 animate-pulse" />
                        <span>Match in progress • Live on crease</span>
                      </p>
                    ) : m.toss_result ? (
                      <p className="text-slate-500 truncate">{m.toss_result}</p>
                    ) : (
                      <p className="text-slate-400">Match fixture scheduled</p>
                    )}
                  </div>
                </div>

                {/* Bottom Action Footer */}
                <div className="px-4 py-3 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-500">
                    ID: #{m.match_id}
                  </span>

                  {onSelectMatch ? (
                    <button
                      type="button"
                      onClick={() => onSelectMatch(String(m.match_id))}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100/80 px-3 py-1.5 rounded-xl transition cursor-pointer"
                    >
                      <span>{isLive ? 'Score Live Match' : 'View Full Scorecard'}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <Link
                      href={`/match/${m.match_id}`}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100/80 px-3 py-1.5 rounded-xl transition cursor-pointer"
                    >
                      <span>{isLive ? 'Score Live Match' : 'View Full Scorecard'}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
