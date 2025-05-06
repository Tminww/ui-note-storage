<script setup lang="ts">
import NavUser from '@/components/NavUser.vue'

import { Label } from '@/components/ui/label'
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarHeader,
    SidebarInput,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    type SidebarProps,
    useSidebar
} from '@/components/ui/sidebar'
import { Switch } from '@/components/ui/switch'
import { ArchiveX, Command, File, Inbox, Send, Trash2, Folder, GitBranch } from 'lucide-vue-next'
import TreeSidebar from '@/components/TreeSidebar.vue'
import { h, ref } from 'vue'

const props = withDefaults(defineProps<SidebarProps>(), {
    collapsible: 'icon'
})

// This is sample data
const data = {
    user: {
        name: 'shadcn',
        email: 'm@example.com',
        avatar: '/avatars/shadcn.jpg'
    },
    navMain: [
        {
            title: 'Folder',
            url: '#',
            icon: Folder,
            isActive: true
        },
        {
            title: 'Git',
            url: '#',
            icon: GitBranch,
            isActive: true
        }
    ],
    mails: [
        {
            name: 'Sophia White',
            email: 'sophiawhite@example.com',
            subject: 'Team Dinner',
            date: '1 week ago',
            teaser: "To celebrate our recent project success, I'd like to organize a team dinner.\nAre you available next Friday evening? Please let me know your preferences."
        }
    ]
}

const activeItem = ref(data.navMain[0])
const mails = ref(data.mails)
const { setOpen } = useSidebar()
</script>

<template>
    <Sidebar class="overflow-hidden *:data-[sidebar=sidebar]:flex-row" v-bind="props">
        <!-- This is the first sidebar -->
        <!-- We disable collapsible and adjust width to icon. -->
        <!-- This will make the sidebar appear as icons. -->
        <Sidebar collapsible="none" class="w-[calc(var(--sidebar-width-icon)+1px)]! border-r">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" as-child class="md:h-8 md:p-0">
                            <a href="#">
                                <div
                                    class="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg"
                                >
                                    <Command class="size-4" />
                                </div>
                                <div class="grid flex-1 text-left text-sm leading-tight">
                                    <span class="truncate font-medium">Acme Inc</span>
                                    <span class="truncate text-xs">Enterprise</span>
                                </div>
                            </a>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupContent class="px-1.5 md:px-0">
                        <SidebarMenu>
                            <SidebarMenuItem v-for="item in data.navMain" :key="item.title">
                                <SidebarMenuButton
                                    :tooltip="h('div', { hidden: false }, item.title)"
                                    :is-active="activeItem.title === item.title"
                                    class="px-2.5 md:px-2"
                                    @click="
                                        () => {
                                            activeItem = item

                                            const mail = data.mails.sort(() => Math.random() - 0.5)
                                            mails = mail.slice(
                                                0,
                                                Math.max(5, Math.floor(Math.random() * 10) + 1)
                                            )
                                            setOpen(true)
                                        }
                                    "
                                >
                                    <component :is="item.icon" />
                                    <span>{{ item.title }}</span>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
            <SidebarFooter>
                <NavUser :user="data.user" />
            </SidebarFooter>
        </Sidebar>

        <!--  This is the second sidebar -->
        <!--  We disable collapsible and let it fill remaining space -->
        <Sidebar collapsible="none" class="hidden flex-1 md:flex">
            <SidebarHeader class="gap-3.5 border-b p-4">
                <div class="flex w-full items-center justify-between">
                    <div class="text-base font-medium text-foreground">
                        {{ activeItem.title }}
                    </div>
                </div>
                <SidebarInput placeholder="Type to search..." />
            </SidebarHeader>
            <SidebarContent>
                <SidebarGroup class="px-0">
                    <SidebarGroupContent>
                        <TreeSidebar v-if="activeItem.title === 'Folder'" />
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
        </Sidebar>
    </Sidebar>
</template>
