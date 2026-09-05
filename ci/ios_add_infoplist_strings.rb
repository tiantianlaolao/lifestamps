# -*- coding: utf-8 -*-
# 戳了么 · 把一份 <lang>.lproj/InfoPlist.strings 登记进 Capacitor 现生成的 Xcode 工程
#
# 为什么要这个脚本：图标下的名字要按系统语言本地化（中文=戳了么，其余=Stampday），
#   靠的是 App 包里的 zh-Hans.lproj/InfoPlist.strings。🔴 光把文件放进目录**不会进包**——
#   它必须在 project.pbxproj 里登记成 PBXVariantGroup + Resources 构建项，Xcode 才会拷。
#   工程每次 `cap add ios` 现生成（仓里没有 ios/），所以登记这一步只能在 CI 里现做。
#   用 xcodeproj gem（macOS runner 随 CocoaPods 自带）而不是 sed 改 pbxproj：那文件的
#   对象 id / 引号规则手拼太容易拼出 Xcode 打不开的工程。
#
# 用法：ruby ci/ios_add_infoplist_strings.rb ios/App/App.xcodeproj zh-Hans
#   前提：ios/App/App/zh-Hans.lproj/InfoPlist.strings 已经写好。
#   幂等：同一 lang 跑两遍不会登记两份。
# 验证（workflow 里做）：pbxproj 出现 `zh-Hans.lproj/InfoPlist.strings`；archive 出来的
#   App.app 里 `plutil -p zh-Hans.lproj/InfoPlist.strings` 能读到 戳了么。
require 'xcodeproj'

proj_path, lang = ARGV
abort('用法: ios_add_infoplist_strings.rb <App.xcodeproj> <lang>') unless proj_path && lang

rel = "#{lang}.lproj/InfoPlist.strings"
abs = File.join(File.dirname(proj_path), 'App', rel)
abort("找不到 #{abs}，先把 strings 文件写好再登记") unless File.file?(abs)

proj = Xcodeproj::Project.open(proj_path)
target = proj.targets.find { |t| t.name == 'App' } or abort('工程里没有 App target')
app_group = proj.main_group['App'] or abort('工程里没有 App group')

# 变体组（Xcode 里那个带小三角的 InfoPlist.strings）：有就复用，没有就建。
vg = app_group.children.find { |c| c.isa == 'PBXVariantGroup' && c.name == 'InfoPlist.strings' }
vg ||= app_group.new_variant_group('InfoPlist.strings')

ref = vg.children.find { |c| c.path == rel }
unless ref
  ref = proj.new(Xcodeproj::Project::Object::PBXFileReference)
  ref.name = lang
  ref.path = rel
  ref.source_tree = '<group>'
  ref.last_known_file_type = 'text.plist.strings'
  vg.children << ref
end

# 变体组本身进 Resources 构建阶段（只登记一次）
already = target.resources_build_phase.files_references.include?(vg)
target.add_resources([vg]) unless already

proj.root_object.known_regions |= [lang]
proj.save

puts "已登记 #{rel}（Resources #{already ? '原有' : '新增'}；knownRegions=#{proj.root_object.known_regions.join(',')}）"
