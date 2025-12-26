!macro customInstall
  ; App 名（表示名）
  StrCpy $0 "Mindra Light"
  ; StartMenuInternet のキー名（英数字推奨）
  StrCpy $1 "MindraLight"
  ; ProgId
  StrCpy $2 "MindraLightHTML"

  ; RegisteredApplications に Capabilities の場所を登録
  WriteRegStr HKCU "Software\RegisteredApplications" "$0" "Software\Clients\StartMenuInternet\$1\Capabilities"

  ; StartMenuInternet 本体
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\$1" "" "$0"

  ; DefaultIcon
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\$1\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"

  ; open command
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\$1\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'

  ; Capabilities
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\$1\Capabilities" "ApplicationName" "$0"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\$1\Capabilities" "ApplicationDescription" "AI-enabled browser"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\$1\Capabilities" "ApplicationIcon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"

  ; URL associations
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\$1\Capabilities\URLAssociations" "http"  "$2"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\$1\Capabilities\URLAssociations" "https" "$2"

  ; ProgId 実体
  WriteRegStr HKCU "Software\Classes\$2" "" "Mindra Light HTML"
  WriteRegStr HKCU "Software\Classes\$2\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Classes\$2\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
!macroend

!macro customUnInstall
  DeleteRegValue HKCU "Software\RegisteredApplications" "Mindra Light"
  DeleteRegKey HKCU "Software\Clients\StartMenuInternet\MindraLight"
  DeleteRegKey HKCU "Software\Classes\MindraLightHTML"
!macroend
