import { create } from 'zustand';
import { ImageItem } from '../types';
import { db } from '../utils/db';
import { useCategoryStore } from './categoryStore';
import { message } from '../components/Message/MessageContainer';

interface ImageState {
    images: ImageItem[];
    addImages: (newImages: ImageItem[]) => Promise<void>;
    deleteImage: (id: string) => Promise<void>;
    deleteAllImages: (onlyFavorites: boolean) => Promise<void>;
    toggleFavorite: (id: string) => Promise<void>;
    getImagesByCategory: (categoryId: string) => ImageItem[];
    getFavoriteImages: () => ImageItem[];
    initImages: () => Promise<void>;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    getFilteredImages: (categoryId: string) => ImageItem[];
    isLoading: boolean;
    setLoading: (loading: boolean) => void;
    isDuplicate: (newImage: ImageItem) => boolean;
    deleteImages: (ids: string[]) => Promise<void>;
}

export const useImageStore = create<ImageState>((set, get) => ({
    images: [],
    searchQuery: '',
    isLoading: false,

    initImages: async () => {
        try {
            set({ isLoading: true });
            await db.init();
            const storedImages = await db.getAll('images');

            const images = storedImages.map(img => ({
                ...img,
                url: URL.createObjectURL(new Blob([img.binaryData], { type: img.type }))
            }));

            set({ images });
            useCategoryStore.getState().updateCounts();
        } catch (error) {
            message.error(`初始化图片失败: ${error}`);
        } finally {
            set({ isLoading: false });
        }
    },

    addImages: async (newImages) => {
        try {
            set({ isLoading: true });

            const uniqueImages = [];
            for (const img of newImages) {
                if (!get().isDuplicate(img)) {
                    uniqueImages.push(img);
                } else {
                    message.warning('Skip the duplicated image');
                }
            }

            const processedImages = await Promise.all(
                uniqueImages.map(async img => {
                    const response = await fetch(img.url);
                    const blob = await response.blob();
                    const binaryData = await blob.arrayBuffer();

                    return {
                        ...img,
                        type: blob.type,
                        binaryData,
                        url: URL.createObjectURL(blob)
                    };
                })
            );

            if (processedImages.length > 0) {
                await db.putAll('images', processedImages);
                set((state) => ({
                    images: [...state.images, ...processedImages]
                }));
            }
        } finally {
            set({ isLoading: false });
        }
    },

    deleteImage: async (id) => {
        await db.delete('images', id);
        set((state) => ({
            images: state.images.filter((img) => img.id !== id),
        }));
    },

    deleteAllImages: async (onlyFavorites) => {
        if (onlyFavorites) {
            const nonFavorites = get().images.filter(img => !img.isFavorite);
            await db.clear('images');
            await db.putAll('images', nonFavorites);
            set({ images: nonFavorites });
        } else {
            await db.clear('images');
            set({ images: [] });
        }
    },

    toggleFavorite: async (id) => {
        const newImages = get().images.map((img) =>
            img.id === id ? { ...img, isFavorite: !img.isFavorite } : img
        );
        await db.putAll('images', newImages);
        set({ images: newImages });
    },

    getImagesByCategory: (categoryId) => {
        const { images } = get();
        return categoryId === 'all'
            ? images
            : images.filter((img) => img.categoryId === categoryId);
    },

    getFavoriteImages: () => {
        const { images } = get();
        return images.filter((img) => img.isFavorite);
    },

    setSearchQuery: (query) => {
        set({ searchQuery: query });
    },

    getFilteredImages: (categoryId) => {
        const { images, searchQuery } = get();
        let filteredImages = categoryId === 'all'
            ? images
            : images.filter((img) => img.categoryId === categoryId);

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filteredImages = filteredImages.filter(img =>
                img.fileName.toLowerCase().includes(query)
            );
        }

        return filteredImages;
    },

    setLoading: (loading) => set({ isLoading: loading }),

    isDuplicate: (newImage: ImageItem) => {
        const { images } = get();

        // 1. 检查文件名
        const hasSameFileName = images.some(img =>
            img.fileName === newImage.fileName
        );

        if (hasSameFileName) return true;

        // // 2. 检查内容哈希
        // if (newImage.binaryData) {
        //     // 使用 crypto-js 计算哈希
        //     const newWordArray = WordArray.create(newImage.binaryData);
        //     const newHash = SHA256(newWordArray).toString(Hex);
        //
        //     return images.some(img => {
        //         if (!img.binaryData) return false;
        //         const existingWordArray = WordArray.create(img.binaryData);
        //         const existingHash = SHA256(existingWordArray).toString(Hex);
        //         return newHash === existingHash;
        //     });
        // }

        return false;
    },

    deleteImages: async (ids: string[]) => {
        try {
            // 批量删除数据库记录
            await Promise.all(ids.map(id => db.delete('images', id)));

            // 更新状态
            set((state) => ({
                images: state.images.filter((img) => !ids.includes(img.id))
            }));

            return Promise.resolve();
        } catch (error) {
            message.error(`批量删除失败: ${error}`);
            return Promise.reject(error);
        }
    },
})); 
