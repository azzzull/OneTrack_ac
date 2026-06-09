import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/useAuth";
import supabase from "../supabaseClient";
import {
    getNotifications,
    getUnreadCount,
    markAllAsRead as markAllNotificationsAsRead,
    markAsRead as markNotificationAsRead,
} from "../services/notificationService";
import { createUniqueChannelName } from "../utils/realtimeChannelManager";

export default function useNotifications({ limit = 20 } = {}) {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const isMountedRef = useRef(true);

    const refresh = useCallback(async () => {
        if (!user?.id) {
            setNotifications([]);
            setUnreadCount(0);
            setLoading(false);
            return;
        }

        try {
            setError(null);
            const [rows, count] = await Promise.all([
                getNotifications({ limit }),
                getUnreadCount(),
            ]);
            if (!isMountedRef.current) return;
            setNotifications(rows);
            setUnreadCount(count);
        } catch (err) {
            console.error("Failed to load notifications:", err);
            if (isMountedRef.current) {
                setError(err);
                setNotifications([]);
                setUnreadCount(0);
            }
        } finally {
            if (isMountedRef.current) setLoading(false);
        }
    }, [limit, user?.id]);

    useEffect(() => {
        isMountedRef.current = true;
        refresh();
        return () => {
            isMountedRef.current = false;
        };
    }, [refresh]);

    useEffect(() => {
        if (!user?.id) return undefined;

        const channelName = createUniqueChannelName(
            "notifications",
            user.id,
        );
        const channel = supabase
            .channel(channelName)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "notifications",
                    filter: `user_id=eq.${user.id}`,
                },
                (payload) => {
                    const row = payload.new;
                    setNotifications((current) => {
                        if (current.some((item) => item.id === row.id)) {
                            return current;
                        }
                        return [row, ...current].slice(0, limit);
                    });
                    setUnreadCount((current) => current + 1);
                },
            )
            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "notifications",
                    filter: `user_id=eq.${user.id}`,
                },
                (payload) => {
                    const row = payload.new;
                    setNotifications((current) =>
                        current.map((item) =>
                            item.id === row.id ? row : item,
                        ),
                    );
                    getUnreadCount()
                        .then((count) => {
                            if (isMountedRef.current) setUnreadCount(count);
                        })
                        .catch((err) =>
                            console.warn(
                                "Failed to refresh unread notifications:",
                                err.message,
                            ),
                        );
                },
            );

        channel.subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [limit, user?.id]);

    const markAsRead = useCallback(async (notificationId) => {
        const row = await markNotificationAsRead(notificationId);
        if (!row) return null;
        setNotifications((current) =>
            current.map((item) => (item.id === row.id ? row : item)),
        );
        setUnreadCount((current) => Math.max(0, current - 1));
        return row;
    }, []);

    const markAllAsRead = useCallback(async () => {
        const rows = await markAllNotificationsAsRead();
        const readIds = new Set(rows.map((row) => row.id));
        setNotifications((current) =>
            current.map((item) =>
                readIds.has(item.id) ? { ...item, is_read: true } : item,
            ),
        );
        setUnreadCount(0);
        return rows;
    }, []);

    return useMemo(
        () => ({
            notifications,
            unreadCount,
            loading,
            error,
            refresh,
            markAsRead,
            markAllAsRead,
        }),
        [
            notifications,
            unreadCount,
            loading,
            error,
            refresh,
            markAsRead,
            markAllAsRead,
        ],
    );
}
