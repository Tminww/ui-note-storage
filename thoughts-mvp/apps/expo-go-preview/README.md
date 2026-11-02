# Thoughts — Expo Go UI Preview

**[ОТКРЫТЬ ДЕМО В EXPO SNACK](https://snack.expo.dev/?name=Thoughts+UI+Demo&sourceUrl=https%3A%2F%2Fraw.githubusercontent.com%2FTminww%2Fui-note-storage%2Fthoughts-ai-inbox-mvp%2Fthoughts-mvp%2Fapps%2Fexpo-go-preview%2FApp.js&sdkVersion=57.0.0&platform=mydevice)**

Это интерактивное демо интерфейса Thoughts без сервера, ключей, Notion, OpenRouter и нативного голосового модуля.

## Запуск с телефона

1. Установи Expo Go, совместимый с SDK 57.
2. Открой ссылку Expo Snack выше в браузере.
3. Выбери **My Device / Open in Expo Go**.
4. Проверь вкладки **Мысли**, **Проекты**, **Настройки**, создай, найди или отредактируй тестовую заметку.

Никаких команд, компьютера, GitHub-ключей или запущенного API не нужно.

**Важно:** всё работает только в памяти, перезагрузка сбрасывает записи. AI, Notion и настоящий микрофон приложения отключены; голос можно вводить через 🎤 системной клавиатуры Android. Настоящие ключи в это демо не вводи.

Для production-приложения с gluestack-ui v5 и нативной речью смотри `../mobile`. Демоверсия стилизована стандартными React Native-компонентами, чтобы работать внутри Expo Go.
